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

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  compareSystemVersions,
  fetchLatestSystemRelease,
  getSystemReleaseUrl,
  getUpdateErrorMessage,
  parseSystemVersion,
  resolveRunningVersion,
  selectLatestRelease,
  UpdateCheckError,
} from '../systemUpdate';

const release = (tag_name, extra = {}) => ({
  tag_name,
  name: tag_name,
  body: 'notes',
  published_at: '2026-01-02T03:04:05Z',
  prerelease: false,
  draft: false,
  ...extra,
});

const t = (key) => key;

describe('parseSystemVersion', () => {
  it('接受三段及以上的核心版本号', () => {
    expect(parseSystemVersion('v1.2.3')?.core).toEqual([1n, 2n, 3n]);
    expect(parseSystemVersion(' 1.2.3.4 ')?.core).toEqual([1n, 2n, 3n, 4n]);
  });

  it('核心段全为 0 视为无效（上游用它过滤占位版本）', () => {
    expect(parseSystemVersion('v0.0.0')).toBeNull();
    expect(parseSystemVersion('0.0.0.0')).toBeNull();
  });

  it('预发布阶段只有 alpha/beta/rc/patch 四种，stable 只能靠不带后缀表达', () => {
    expect(parseSystemVersion('v1.2.3-alpha.1')?.stage).toBe(0);
    expect(parseSystemVersion('v1.2.3-beta.2')?.stage).toBe(1);
    expect(parseSystemVersion('v1.2.3-rc.3')?.stage).toBe(2);
    expect(parseSystemVersion('v1.2.3-patch.1')?.stage).toBe(4);
    expect(parseSystemVersion('v1.2.3')?.stage).toBe(3);
    // `-stable` 不是上游语法里的合法后缀，别把它当稳定版接受。
    expect(parseSystemVersion('v1.2.3-stable')).toBeNull();
    // 本 fork 硬编码的运行版本就是这一类「非上游阶段」，必须解析失败。
    expect(parseSystemVersion('v0.0.0-zhaoyj')).toBeNull();
    expect(parseSystemVersion('v1.2.3-nightly.1')).toBeNull();
  });

  it('-i18nfix.N 只允许跟在 rc 之后', () => {
    expect(parseSystemVersion('v1.2.3-rc.1-i18nfix.2')?.revision).toBe(2n);
    expect(parseSystemVersion('v1.2.3-beta.1-i18nfix.2')).toBeNull();
  });

  it('构建元数据（+ 后面）不参与比较但要能解析', () => {
    expect(parseSystemVersion('v1.2.3+build.9')?.core).toEqual([1n, 2n, 3n]);
  });

  it('两段版本、空值与非字符串一律无效', () => {
    expect(parseSystemVersion('v1.2')).toBeNull();
    expect(parseSystemVersion('')).toBeNull();
    expect(parseSystemVersion(null)).toBeNull();
    expect(parseSystemVersion(undefined)).toBeNull();
    expect(parseSystemVersion(123)).toBeNull();
  });
});

describe('compareSystemVersions', () => {
  it('按核心段逐位比较，短的一侧补 0', () => {
    expect(compareSystemVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSystemVersions('1.3.0', '1.2.9')).toBe(1);
    expect(compareSystemVersions('1.2.3', '1.2.3.0')).toBe(0);
    expect(compareSystemVersions('1.2.3.1', '1.2.3')).toBe(1);
  });

  it('预发布排在稳定版之前，patch 排在稳定版之后', () => {
    expect(compareSystemVersions('1.2.3-rc.1', '1.2.3')).toBe(-1);
    expect(compareSystemVersions('1.2.3-patch.1', '1.2.3')).toBe(1);
    expect(compareSystemVersions('1.2.3-rc.1', '1.2.3-rc.2')).toBe(-1);
    expect(
      compareSystemVersions('1.2.3-rc.1-i18nfix.1', '1.2.3-rc.1-i18nfix.2'),
    ).toBe(-1);
  });

  it('任一版本无法解析时返回 null（未知），不能误判成相等或有更新', () => {
    expect(compareSystemVersions('v0.0.0-zhaoyj', '1.2.3')).toBeNull();
    expect(compareSystemVersions('1.2.3', undefined)).toBeNull();
  });

  it('大版本号用 BigInt，不会因为超出 Number 安全整数而比错', () => {
    expect(
      compareSystemVersions(
        '1.0.0.99999999999999999999',
        '1.0.0.99999999999999999998',
      ),
    ).toBe(1);
  });
});

describe('selectLatestRelease', () => {
  it('挑最新版本而不是数组里的第一个', () => {
    const payload = [release('v1.5.0'), release('v1.10.0'), release('v1.4.9')];
    expect(selectLatestRelease(payload)?.tag_name).toBe('v1.10.0');
  });

  it('跳过 draft、跳过解析不出版本号的 tag、跳过形状不合法的条目', () => {
    const payload = [
      release('v9.9.9', { draft: true }),
      release('not-a-version'),
      { tag_name: 'v2.0.0' }, // 缺 prerelease，形状不合
      release('v1.9.0', { prerelease: true }),
      release('v1.8.0'),
    ];
    expect(selectLatestRelease(payload)?.tag_name).toBe('v1.9.0');
  });

  it('空数组是「真的没有发行版」，返回 null 而不是抛错', () => {
    expect(selectLatestRelease([])).toBeNull();
  });

  it('整批条目形状都不对时抛错，用来区分「没有发行版」和「响应不是预期结构」', () => {
    expect(() => selectLatestRelease([{ foo: 1 }])).toThrow(
      'Unexpected release payload',
    );
    expect(() => selectLatestRelease({ tag_name: 'v1.0.0' })).toThrow(
      'Unexpected release payload',
    );
  });

  it('tag_name 会先 trim 再返回', () => {
    expect(selectLatestRelease([release('  v1.2.3  ')])?.tag_name).toBe(
      'v1.2.3',
    );
  });
});

describe('getSystemReleaseUrl', () => {
  it('指向 QuantumNous 仓库并对 tag 做 URL 编码', () => {
    expect(getSystemReleaseUrl({ tag_name: 'v1.2.3' })).toBe(
      'https://github.com/QuantumNous/new-api/releases/tag/v1.2.3',
    );
    expect(getSystemReleaseUrl({ tag_name: 'v1.2.3 rc' })).toContain(
      'v1.2.3%20rc',
    );
  });
});

describe('resolveRunningVersion', () => {
  it('v0.0.0 / 0.0.0 当未知处理，其它值去空格返回', () => {
    expect(resolveRunningVersion('v0.0.0')).toBeUndefined();
    expect(resolveRunningVersion('0.0.0')).toBeUndefined();
    expect(resolveRunningVersion('  v1.2.3  ')).toBe('v1.2.3');
    expect(resolveRunningVersion('')).toBeUndefined();
    expect(resolveRunningVersion(undefined)).toBeUndefined();
  });

  it('fork 标识 v0.0.0-zhaoyj 原样透出（不特殊放行，比较结果自然是 null）', () => {
    expect(resolveRunningVersion('v0.0.0-zhaoyj')).toBe('v0.0.0-zhaoyj');
  });
});

describe('getUpdateErrorMessage', () => {
  it('四种错误码各有文案，未知码回落到通用文案', () => {
    expect(getUpdateErrorMessage('rate-limit', t)).toContain('限流');
    expect(getUpdateErrorMessage('timeout', t)).toContain('超时');
    expect(getUpdateErrorMessage('payload', t)).toContain('格式异常');
    expect(getUpdateErrorMessage('network', t)).toBe('检查更新失败');
    expect(getUpdateErrorMessage(undefined, t)).toBe('检查更新失败');
  });
});

describe('fetchLatestSystemRelease', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (status, body) =>
    vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }));

  it('成功时返回最新 release，并带上 GitHub 要求的 Accept 头与 omit 凭据', async () => {
    const fetchMock = respond(200, [release('v1.2.3'), release('v1.3.0')]);
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchLatestSystemRelease(new AbortController().signal);
    expect(result.tag_name).toBe('v1.3.0');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('repos/QuantumNous/new-api/releases');
    expect(url).toContain('per_page=100');
    expect(init.credentials).toBe('omit');
    expect(init.headers.Accept).toBe('application/vnd.github+json');
  });

  it('403 / 429 归类为 rate-limit，不能和站点故障混为一谈', async () => {
    for (const status of [403, 429]) {
      vi.stubGlobal('fetch', respond(status, {}));
      await expect(
        fetchLatestSystemRelease(new AbortController().signal),
      ).rejects.toMatchObject({ code: 'rate-limit' });
    }
  });

  it('其它非 2xx 归类为 network', async () => {
    vi.stubGlobal('fetch', respond(500, {}));
    await expect(
      fetchLatestSystemRelease(new AbortController().signal),
    ).rejects.toBeInstanceOf(UpdateCheckError);
    await expect(
      fetchLatestSystemRelease(new AbortController().signal),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('响应体不是预期结构归类为 payload', async () => {
    vi.stubGlobal('fetch', respond(200, { message: 'bad' }));
    await expect(
      fetchLatestSystemRelease(new AbortController().signal),
    ).rejects.toMatchObject({ code: 'payload' });
  });

  it('fetch 本身抛错（断网）归类为 network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(
      fetchLatestSystemRelease(new AbortController().signal),
    ).rejects.toMatchObject({ code: 'network' });
  });

  it('调用方已取消时向外抛原始 abort 错误，而不是伪装成 timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init) => {
        // 内部控制器此刻已被 abort：真实 fetch 会立刻抛 AbortError，这里照做。
        if (init.signal.aborted) return Promise.reject(init.signal.reason);
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(init.signal.reason),
          );
        });
      }),
    );
    await expect(
      fetchLatestSystemRelease(controller.signal),
    ).rejects.not.toBeInstanceOf(UpdateCheckError);
  });
});
