/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * 系统更新检查服务（纯逻辑，不依赖 React / Semi，便于单测）。
 * 契约来源：新版前端 web/src/features/system-update/{releases.ts,api.ts}，
 * 逐条对齐它的解析规则、错误分类与「拉最新 100 个 release 再自己挑」的口径。
 *
 * 关键口径（别「优化」掉）：
 * - 更新源是浏览器直连 GitHub API（`credentials: 'omit'`，不带本站凭据），
 *   本站后端没有代理端点，上游也没有；因此 403/429 必须单独归类成 rate-limit，
 *   否则用户会把「匿名 60 次/小时额度用尽」看成站点故障。
 * - 版本号解析比 semver 更宽：接受 3 段及以上核心版本（`1.2.3` / `1.2.3.4`），
 *   预发布阶段只有 alpha/beta/rc/patch 四种，`-i18nfix.N` 只允许跟在 rc 后面，
 *   核心三段全为 0 视为无效（上游用它过滤占位版本）。
 * - 任一版本解析不出来时比较结果是 `null`（未知），**不是**「相等」也「不是」「有更新」；
 *   调用方必须区分这三种情形，见 compareSystemVersions 的返回值。
 * - 只有 draft=false 且 tag 能被解析的 release 才参与挑选；整个数组里没有合法项时
 *   selectLatestRelease 返回 null，但 payload 根本不是数组要抛错（区分「没有发行版」
 *   和「响应不是我预期的形状」）。
 */

export const GITHUB_RELEASES_API =
  'https://api.github.com/repos/QuantumNous/new-api/releases?per_page=100';

export const UPDATE_CHECK_TIMEOUT_MS = 10000;

export const UPDATE_CHECK_ERROR_CODES = [
  'network',
  'rate-limit',
  'timeout',
  'payload',
];

const RELEASE_STAGES = {
  alpha: 0,
  beta: 1,
  rc: 2,
  stable: 3,
  patch: 4,
};

const VERSION_PATTERN =
  /^v?(\d+(?:\.\d+){2,})(?:-(alpha|beta|rc|patch)(?:\.(\d+))?(?:-i18nfix\.(\d+))?)?(?:\+[\da-zA-Z.-]+)?$/;

export class UpdateCheckError extends Error {
  constructor(code) {
    super(code);
    this.name = 'UpdateCheckError';
    this.code = code;
  }
}

/**
 * 解析版本号，返回 { core: bigint[], stage, sequence, revision } 或 null。
 * stage 用数字表示，是为了让 alpha<beta<rc<stable<patch 直接可比。
 */
export function parseSystemVersion(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(VERSION_PATTERN);
  // `-i18nfix.N` 只是 rc 的历史修订号，挂在别的阶段上是坏数据。
  if (!match || (match[4] && match[2] !== 'rc')) return null;

  const core = match[1].split('.').map((part) => BigInt(part));
  if (core.every((part) => part === 0n)) return null;

  return {
    core,
    stage: RELEASE_STAGES[match[2] || 'stable'],
    sequence: BigInt(match[3] || '0'),
    revision: BigInt(match[4] || '0'),
  };
}

/**
 * 比较两个版本号：-1 / 0 / 1，任一无法解析返回 null（未知）。
 * 核心段长度不等时短的一侧补 0，所以 1.2.3 与 1.2.3.0 相等。
 */
export function compareSystemVersions(left, right) {
  const a = parseSystemVersion(left);
  const b = parseSystemVersion(right);
  if (!a || !b) return null;

  const length = Math.max(a.core.length, b.core.length);
  for (let index = 0; index < length; index++) {
    const leftPart = a.core[index] ?? 0n;
    const rightPart = b.core[index] ?? 0n;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  if (a.stage !== b.stage) return a.stage < b.stage ? -1 : 1;
  if (a.sequence !== b.sequence) return a.sequence < b.sequence ? -1 : 1;
  if (a.revision !== b.revision) return a.revision < b.revision ? -1 : 1;
  return 0;
}

const optionalString = (value) =>
  value === null || value === undefined || typeof value === 'string';

/**
 * 校验单个 release 的形状（对齐新版 systemReleaseSchema）。
 * 返回规范化后的对象，字段缺失/类型不符返回 null。
 */
function normalizeRelease(item, { requireDraft = false } = {}) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.tag_name !== 'string') return null;
  const tagName = item.tag_name.trim();
  if (!tagName) return null;
  if (!optionalString(item.name) || !optionalString(item.body)) return null;
  if (!optionalString(item.published_at)) return null;
  if (typeof item.prerelease !== 'boolean') return null;
  if (requireDraft && typeof item.draft !== 'boolean') return null;
  if (item.published_at !== null && item.published_at !== undefined) {
    // 对齐 z.iso.datetime()：只认能解析出来的 ISO 串。
    if (Number.isNaN(Date.parse(item.published_at))) return null;
  }

  return {
    tag_name: tagName,
    name: item.name ?? null,
    body: item.body ?? null,
    published_at: item.published_at ?? null,
    prerelease: item.prerelease,
    ...(requireDraft ? { draft: item.draft } : {}),
  };
}

/**
 * 从 GitHub releases 数组里挑出最新的一个。
 * 入参不是数组要抛错——「空数组」（真没有发行版）和「响应形状不对」必须能区分开。
 */
export function selectLatestRelease(payload) {
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected release payload');
  }

  let latest = null;
  let validPayload = payload.length === 0;
  for (const item of payload) {
    const release = normalizeRelease(item, { requireDraft: true });
    if (!release) continue;
    validPayload = true;
    if (release.draft || !parseSystemVersion(release.tag_name)) continue;
    if (
      !latest ||
      compareSystemVersions(release.tag_name, latest.tag_name) === 1
    ) {
      latest = normalizeRelease(item);
    }
  }
  if (!validPayload) {
    throw new Error('Unexpected release payload');
  }
  return latest;
}

export function getSystemReleaseUrl(release) {
  return `https://github.com/QuantumNous/new-api/releases/tag/${encodeURIComponent(
    release.tag_name,
  )}`;
}

/**
 * 拉最新发行版。signal 由调用方持有（切页/卸载要能取消），内部再叠一层超时。
 * 失败一律抛 UpdateCheckError；只有调用方主动取消时才向外抛原始 abort 错误。
 */
export async function fetchLatestSystemRelease(externalSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (externalSignal) {
    externalSignal.addEventListener('abort', cancel, { once: true });
    if (externalSignal.aborted) controller.abort();
  }
  const timeout = setTimeout(cancel, UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_RELEASES_API, {
      credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (response.status === 403 || response.status === 429) {
      throw new UpdateCheckError('rate-limit');
    }
    if (!response.ok) throw new UpdateCheckError('network');

    try {
      return selectLatestRelease(await response.json());
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new UpdateCheckError('payload');
    }
  } catch (error) {
    if (externalSignal && externalSignal.aborted) throw error;
    if (controller.signal.aborted) throw new UpdateCheckError('timeout');
    if (error instanceof UpdateCheckError) throw error;
    throw new UpdateCheckError('network');
  } finally {
    clearTimeout(timeout);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', cancel);
    }
  }
}

export function getUpdateErrorMessage(code, t) {
  switch (code) {
    case 'rate-limit':
      return t('GitHub 接口限流，请稍后再试');
    case 'timeout':
      return t('检查更新超时，请重试');
    case 'payload':
      return t('发行版数据格式异常');
    default:
      return t('检查更新失败');
  }
}

/**
 * 上游把 `v0.0.0` / `0.0.0` 视为「没写版本的开发构建」，直接当未知处理。
 * 本 fork 硬编码的是 `v0.0.0-zhaoyj`（common/constants.go:14），它本来就解析不出
 * 合法版本号，所以比较结果是 null —— 这里不要特殊放行，否则会拿 fork 标识去
 * 和上游 tag 比大小，得出「有更新」的错误结论。
 */
export function resolveRunningVersion(version) {
  const trimmed = typeof version === 'string' ? version.trim() : '';
  if (trimmed === 'v0.0.0' || trimmed === '0.0.0') return undefined;
  return trimmed || undefined;
}
