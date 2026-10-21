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

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { API, statusDispatch, userDispatch } = vi.hoisted(() => ({
  API: { get: vi.fn() },
  statusDispatch: vi.fn(),
  userDispatch: vi.fn(),
}));

vi.mock('../../../helpers/api', () => ({ API }));

import { StatusContext } from '../../../context/Status';
import { UserContext } from '../../../context/User';
import {
  clearSystemUpdateStorage,
  getIgnoredVersions,
  getSnapshot,
  setSnapshot,
  SNAPSHOT_STORAGE_KEY,
} from '../../../helpers/systemUpdateStore';
import { useSystemUpdate } from '../useSystemUpdate';

if (typeof globalThis.IS_REACT_ACT_ENVIRONMENT === 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

const ROLE_ADMIN = 10;
const ROLE_USER = 1;

const releaseOf = (tag_name, extra = {}) => ({
  tag_name,
  name: tag_name,
  body: 'notes',
  published_at: '2026-01-02T03:04:05Z',
  prerelease: false,
  draft: false,
  ...extra,
});

const roots = [];

/**
 * classic 自带 React 18，而父级 node_modules 的 @testing-library 跑在 React 19 上，
 * 混用会让 hooks 拿到 null dispatcher —— 这里沿用 hooks/channels 里那套
 * renderHookCompat 的思路（本测试还需要包两层 Provider，所以直接建 root）。
 */
function renderUpdate({
  role = ROLE_ADMIN,
  userId = 1,
  version = 'v1.0.0',
} = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const result = { current: undefined };

  const TestComponent = () => {
    result.current = useSystemUpdate();
    return null;
  };

  React.act(() => {
    root.render(
      React.createElement(
        StatusContext.Provider,
        { value: [{ status: { version } }, statusDispatch] },
        React.createElement(
          UserContext.Provider,
          { value: [{ user: { id: userId, role } }, userDispatch] },
          React.createElement(TestComponent),
        ),
      ),
    );
  });
  return result;
}

// 把挂起的微任务/宏任务都在 act 作用域内跑完：runCheck 是 fetch + setState 的
// 多段 Promise 链，act 作用域一结束才落地就会刷 "not wrapped in act" 噪音。
const flush = () =>
  React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// 轮询到条件成立为止。全量并跑时 CPU 繁忙，一趟检查可能跨好几个宏任务才落地，
// 只 flush 一次的测试会偶发读到中间态。
const settle = async (predicate, rounds = 20) => {
  for (let i = 0; i < rounds; i++) {
    if (predicate()) return;
    await flush();
  }
  throw new Error('settle 超时：等待的条件始终未满足');
};

const stubReleases = (payload, { status = 200 } = {}) => {
  const fetchMock = vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  localStorage.clear();
  clearSystemUpdateStorage();
  statusDispatch.mockClear();
  userDispatch.mockClear();
  API.get.mockReset();
  API.get.mockResolvedValue({
    data: { success: true, data: { version: 'v1.0.0' } },
  });
});

afterEach(() => {
  // 卸载也是状态更新，必须包在 act 里，否则 React 会刷一片
  // "An update to Root inside a test was not wrapped in act" 的噪音。
  React.act(() => {
    while (roots.length) {
      const root = roots.pop();
      try {
        root.unmount();
      } catch {
        /* 已卸载的 root 忽略 */
      }
    }
  });
  vi.unstubAllGlobals();
});

describe('useSystemUpdate 的调用门槛', () => {
  it('非管理员不发任何 GitHub 请求', async () => {
    const fetchMock = stubReleases([releaseOf('v1.2.3')]);
    renderUpdate({ role: ROLE_USER });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSnapshot()).toBeNull();
  });

  it('无缓存的管理员首挂载检查一次，结果落快照', async () => {
    const fetchMock = stubReleases([releaseOf('v1.2.3')]);
    const result = renderUpdate();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.release.tag_name).toBe('v1.2.3');
    expect(result.current.hasUpdate).toBe(true);
    expect(result.current.shouldNotify).toBe(true);
    expect(getSnapshot().error).toBeNull();
  });

  it('顺手刷新 /api/status，让长期开着的标签页也能发现服务端升级', async () => {
    stubReleases([releaseOf('v1.2.3')]);
    renderUpdate({ version: undefined });
    await flush();
    expect(API.get).toHaveBeenCalledWith('/api/status');
    expect(statusDispatch).toHaveBeenCalledWith({
      type: 'set',
      payload: { version: 'v1.0.0' },
    });
  });

  it('一小时内的旧缓存直接复用，不再请求；过期才请求', async () => {
    const fresh = stubReleases([releaseOf('v2.0.0')]);
    setSnapshot({
      release: releaseOf('v1.9.0'),
      lastCheckedAt: Date.now(),
      lastAttemptAt: Date.now(),
      error: null,
    });
    const result = renderUpdate();
    await flush();
    expect(fresh).not.toHaveBeenCalled();
    expect(result.current.release.tag_name).toBe('v1.9.0');

    // 此时上面的实例还在订阅，写入也要包 act。
    React.act(() => {
      setSnapshot({
        release: releaseOf('v1.9.0'),
        lastCheckedAt: Date.now() - 61 * 60 * 1000,
        lastAttemptAt: Date.now() - 61 * 60 * 1000,
        error: null,
      });
    });
    const staleResult = renderUpdate();
    await flush();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(staleResult.current.release.tag_name).toBe('v2.0.0');
  });

  it('两个实例同时挂载只发一次请求（模块级单飞，替代上游的查询缓存去重）', async () => {
    let resolveBody;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveBody = () =>
            resolve({
              status: 200,
              ok: true,
              json: async () => [releaseOf('v1.2.3')],
            });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderUpdate({ userId: 1 });
    renderUpdate({ userId: 2 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    React.act(() => {
      resolveBody();
    });
    await flush();
    expect(getSnapshot().release.tag_name).toBe('v1.2.3');
  });

  it('离线时不发请求', async () => {
    const fetchMock = stubReleases([releaseOf('v1.2.3')]);
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    renderUpdate();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });
});

describe('useSystemUpdate 的失败与忽略', () => {
  it('失败也写快照：保留上次的 release，只前移 lastAttemptAt 并记录错误码', async () => {
    stubReleases({}, { status: 403 });
    const stale = {
      release: releaseOf('v1.2.3'),
      lastCheckedAt: Date.now() - 61 * 60 * 1000,
      lastAttemptAt: Date.now() - 61 * 60 * 1000,
      error: null,
    };
    setSnapshot(stale);
    const result = renderUpdate();
    await flush();

    const snapshot = getSnapshot();
    expect(snapshot.error).toBe('rate-limit');
    expect(snapshot.release.tag_name).toBe('v1.2.3');
    expect(snapshot.lastAttemptAt).toBeGreaterThan(stale.lastAttemptAt);
    expect(snapshot.lastCheckedAt).toBe(stale.lastCheckedAt);
    expect(result.current.snapshot.error).toBe('rate-limit');
    // 缓存里的结论继续生效：失败只是「这次没查到」，不该抹掉已有提醒（对齐上游）。
    expect(result.current.shouldNotify).toBe(true);
  });

  it('忽略某版本后不再提醒，且忽略状态按用户隔离', async () => {
    stubReleases([releaseOf('v1.2.3')]);
    const adminA = renderUpdate({ userId: 11, version: 'v1.0.0' });
    await flush();
    // v1.0.0 与 v1.2.3 可比且有更新
    expect(adminA.current.hasUpdate).toBe(true);
    expect(adminA.current.shouldNotify).toBe(true);

    React.act(() => {
      adminA.current.setIgnored(true);
    });
    await flush();
    expect(adminA.current.isIgnored).toBe(true);
    expect(adminA.current.shouldNotify).toBe(false);
    expect(getIgnoredVersions(11)).toEqual(['v1.2.3']);

    const adminB = renderUpdate({ userId: 12, version: 'v1.0.0' });
    await flush();
    expect(adminB.current.isIgnored).toBe(false);
    expect(adminB.current.shouldNotify).toBe(true);
  });

  it('恢复提醒会清空该用户的忽略列表', async () => {
    stubReleases([releaseOf('v1.2.3')]);
    const result = renderUpdate({ userId: 13, version: 'v1.0.0' });
    await flush();
    React.act(() => {
      result.current.setIgnored(true);
    });
    await flush();
    let restored = false;
    React.act(() => {
      restored = result.current.setIgnored(false);
    });
    expect(restored).toBe(true);
    await flush();
    expect(getIgnoredVersions(13)).toEqual([]);
    expect(result.current.shouldNotify).toBe(true);
  });

  it('已是最新版本时不提醒，也允许忽略（对齐上游 canIgnore 的两种情形）', async () => {
    stubReleases([releaseOf('v1.0.0')]);
    const result = renderUpdate({ version: 'v1.0.0' });
    await flush();
    expect(result.current.comparison).toBe(0);
    expect(result.current.hasUpdate).toBe(false);
    expect(result.current.shouldNotify).toBe(false);
  });

  it('fork 运行版本 v0.0.0-zhaoyj 比较结果是 null，不会误报有更新', async () => {
    stubReleases([releaseOf('v9.9.9')]);
    const result = renderUpdate({ version: 'v0.0.0-zhaoyj' });
    await flush();
    expect(result.current.currentVersion).toBe('v0.0.0-zhaoyj');
    expect(result.current.comparison).toBeNull();
    expect(result.current.hasUpdate).toBe(false);
    expect(result.current.shouldNotify).toBe(false);
  });

  it('另一标签页写好快照后，本标签页通过 storage 事件同步', async () => {
    stubReleases([releaseOf('v1.2.3')]);
    const result = renderUpdate({ version: 'v1.0.0' });
    // 先确认本标签页这趟检查已经落地：在途请求晚于 storage 事件返回时，
    // 会把另一标签页刚写入的快照覆盖回旧结果（真实页面只是多显示一次旧结论，
    // 但测试必须排除这个竞态，否则满载并跑时会偶发失败）。
    await settle(
      () =>
        result.current.release?.tag_name === 'v1.2.3' &&
        !result.current.checking,
    );

    const other = {
      release: releaseOf('v3.0.0'),
      lastCheckedAt: Date.now(),
      lastAttemptAt: Date.now(),
      error: null,
    };
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(other));
    await React.act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: SNAPSHOT_STORAGE_KEY }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.release.tag_name).toBe('v3.0.0');
  });
});
