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
*/

/**
 * 任务插件市场纯函数层。移植自新版前端
 * web/src/features/task-plugins/lib/marketplace.ts 与 plugin-url.ts。
 * 索引属于不可信输入：解析时丢弃未知字段、跳过畸形条目，准入仍在服务端。
 */

export const SUPPORTED_INDEX_VERSION = 1;
/** 网关当前只运行 task 类插件 */
export const SUPPORTED_PLUGIN_KIND = 'task';

export const MAX_PLUGIN_SOURCE_BYTES = 8 * 1024 * 1024;

export const DEFAULT_MARKETPLACE_INDEX_URL =
  'https://www.newapi.ai/api/v1/plugins/index.json';

export const GITHUB_MARKETPLACE_INDEX_URL =
  'https://raw.githubusercontent.com/QuantumNous/new-api-plugins/main/index.json';

export function pluginSourceByteLength(source) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(source).length;
  }
  return source.length;
}

/**
 * 把版本 path 解析到索引所在 origin 内的绝对 URL；
 * 跨 origin 或非法 URL 返回 null。
 */
export function resolvePluginSourceUrl(indexUrl, path) {
  const trimmed = (path || '').trim();
  if (!trimmed) return null;
  let base;
  try {
    base = new URL(indexUrl);
  } catch {
    return null;
  }
  let resolved;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }
  if (resolved.origin !== base.origin) return null;
  return resolved.toString();
}

function stringArray(value) {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === 'string' && item.length > 0)) {
    return undefined;
  }
  return value;
}

function numberArray(value) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item) => typeof item === 'number' && Number.isFinite(item),
  );
  return items.length > 0 ? items : undefined;
}

function parseDescription(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const mapped = {};
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === 'string') mapped[locale] = text;
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function sanitizeIcon(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (
    trimmed &&
    trimmed.length <= 128 &&
    !trimmed.startsWith('data:') &&
    !trimmed.includes('://')
  ) {
    return trimmed;
  }
  return undefined;
}

function parsePluginIconFile(value) {
  if (!value || typeof value !== 'object') return undefined;
  const iconPath = typeof value.path === 'string' ? value.path.trim() : '';
  if (!/\.(svg|png)$/i.test(iconPath)) return undefined;
  return {
    path: iconPath,
    sha256:
      typeof value.sha256 === 'string' ? value.sha256.trim() : undefined,
  };
}

function parseMarketplacePlugin(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const key = typeof entry.key === 'string' ? entry.key.trim() : '';
  if (!key) return null;

  const versions = [];
  if (Array.isArray(entry.versions)) {
    for (const candidate of entry.versions) {
      if (!candidate || typeof candidate !== 'object') continue;
      const version =
        typeof candidate.version === 'string' ? candidate.version.trim() : '';
      const path = typeof candidate.path === 'string' ? candidate.path.trim() : '';
      if (!version || !path) continue;
      const kind = typeof candidate.kind === 'string' ? candidate.kind.trim() : '';
      if (kind && kind !== SUPPORTED_PLUGIN_KIND) continue;
      versions.push({
        version,
        path,
        sha256:
          typeof candidate.sha256 === 'string'
            ? candidate.sha256.trim()
            : undefined,
        minApiVersion: Number.isFinite(Number(candidate.minApiVersion))
          ? Number(candidate.minApiVersion)
          : undefined,
        kind: kind || undefined,
        allowedHosts: stringArray(candidate.allowedHosts),
        baseUrl:
          typeof candidate.baseUrl === 'string' && candidate.baseUrl.trim()
            ? candidate.baseUrl.trim()
            : undefined,
        auth: typeof candidate.auth === 'string' ? candidate.auth : undefined,
      });
    }
  }
  if (versions.length === 0) return null;

  const declaredLatest =
    typeof entry.latest === 'string' ? entry.latest.trim() : '';
  const latest = versions.some((item) => item.version === declaredLatest)
    ? declaredLatest
    : versions[0].version;

  const sortPriorityRaw = entry.sortPriority;
  const sortPriority =
    typeof sortPriorityRaw === 'number' &&
    Number.isInteger(sortPriorityRaw) &&
    sortPriorityRaw >= -2147483648 &&
    sortPriorityRaw <= 2147483647
      ? sortPriorityRaw
      : 0;

  return {
    key,
    sortPriority,
    website:
      typeof entry.website === 'string' && entry.website.trim()
        ? entry.website.trim()
        : undefined,
    name: typeof entry.name === 'string' && entry.name ? entry.name : key,
    icon: sanitizeIcon(entry.icon),
    iconFile: parsePluginIconFile(entry.iconFile),
    description: parseDescription(entry.description),
    channelTypes: numberArray(entry.channelTypes),
    models: stringArray(entry.models),
    latest,
    versions,
  };
}

/** 校验并规范化不可信的索引 JSON；不合法时抛错 */
export function parseMarketplaceIndex(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('index is not an object');
  }
  const indexVersion = Number(payload.indexVersion);
  if (!Number.isFinite(indexVersion)) {
    throw new Error('index is missing indexVersion');
  }
  if (indexVersion > SUPPORTED_INDEX_VERSION) {
    throw new Error(`unsupported indexVersion ${indexVersion}`);
  }
  const plugins = [];
  if (Array.isArray(payload.plugins)) {
    for (const entry of payload.plugins) {
      const plugin = parseMarketplacePlugin(entry);
      if (plugin) plugins.push(plugin);
    }
  }
  plugins.sort((left, right) => {
    const difference =
      (right.sortPriority ?? 0) - (left.sortPriority ?? 0);
    if (difference !== 0) return difference;
    if (left.key === right.key) return 0;
    return left.key < right.key ? -1 : 1;
  });
  return {
    indexVersion,
    name: typeof payload.name === 'string' ? payload.name : '',
    plugins,
  };
}

export function findMarketplaceVersion(plugin, version) {
  return (plugin?.versions ?? []).find((entry) => entry.version === version);
}

/**
 * 对比市场条目与已安装插件：not_installed / up_to_date / upgradable / diverged。
 * diverged 表示本地版本不在索引中（手动上传或源回滚），不能称为升级。
 */
export function deriveInstallState(plugin, installed) {
  const match = (installed ?? []).find((item) => item.meta?.key === plugin.key);
  if (!match) return { status: 'not_installed' };
  const installedVersion = match.meta?.version;
  if (installedVersion === plugin.latest) {
    return { status: 'up_to_date', installedVersion };
  }
  const known = plugin.versions.some(
    (entry) => entry.version === installedVersion,
  );
  if (!known) {
    return { status: 'diverged', installedVersion, latestVersion: plugin.latest };
  }
  return { status: 'upgradable', installedVersion, latestVersion: plugin.latest };
}

/** 仅当每个版本都带 sha256 时才可做完整性校验 */
export function indexHasIntegrityHashes(index) {
  return (
    (index?.plugins?.length ?? 0) > 0 &&
    index.plugins.every((plugin) =>
      plugin.versions.every((version) => Boolean(version.sha256)),
    )
  );
}

/** 项目维护的内建源之外都按第三方风险提示 */
export function isDefaultMarketplaceSource(indexUrl) {
  const normalized = (indexUrl || '').trim();
  return (
    normalized === DEFAULT_MARKETPLACE_INDEX_URL ||
    normalized === GITHUB_MARKETPLACE_INDEX_URL
  );
}

export class PluginSourceFetchError extends Error {
  constructor(reason, status) {
    super(reason);
    this.name = 'PluginSourceFetchError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * 浏览器侧抓取插件源文本。网关从不代抓（无 SSRF 面），
 * no-cache 保证重发布后的索引哈希校验基于最新字节。
 */
export async function fetchPluginSourceText(url, fetchImpl) {
  const doFetch = fetchImpl || globalThis.fetch;
  let response;
  try {
    response = await doFetch(url, { cache: 'no-cache' });
  } catch {
    throw new PluginSourceFetchError('unreachable');
  }
  if (!response.ok) {
    throw new PluginSourceFetchError('not_found', response.status);
  }
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PLUGIN_SOURCE_BYTES
  ) {
    throw new PluginSourceFetchError('too_large');
  }
  const text = await response.text();
  if (pluginSourceByteLength(text) > MAX_PLUGIN_SOURCE_BYTES) {
    throw new PluginSourceFetchError('too_large');
  }
  return text;
}

/** SHA-256 摘要（hex）。WebCrypto 不可用时返回 null（服务端仍会重哈希校验） */
export async function computeSourceSha256(source) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 把面向人的代码托管页面 URL 改写成 raw 内容 URL（GitHub / gist），
 * 便于直接粘贴页面链接导入插件源码。非 http(s) URL 返回 null，
 * 其余 URL 原样返回。
 */
export function normalizePluginSourceUrl(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.hash = '';
  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (host === 'github.com' || host === 'www.github.com') {
    const isSourceView = segments[2] === 'blob' || segments[2] === 'raw';
    if (isSourceView && segments.length > 4) {
      const rest = segments.slice(3).join('/');
      return `https://raw.githubusercontent.com/${segments[0]}/${segments[1]}/${rest}`;
    }
    return parsed.toString();
  }

  if (host === 'gist.github.com' && segments.length > 0) {
    const path = segments.join('/');
    const suffix = segments.includes('raw') ? path : `${path}/raw`;
    return `https://gist.githubusercontent.com/${suffix}${parsed.search}`;
  }

  return parsed.toString();
}
