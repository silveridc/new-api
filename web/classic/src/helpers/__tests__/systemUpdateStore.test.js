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

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  clearSystemUpdateStorage,
  getIgnoredVersions,
  getSnapshot,
  normalizeSnapshot,
  PREFERENCES_STORAGE_KEY,
  setSnapshot,
  setVersionIgnored,
  SNAPSHOT_STORAGE_KEY,
  subscribeSystemUpdates,
} from '../systemUpdateStore';

const now = () => Date.now();

const snapshotOf = (overrides = {}) => ({
  release: {
    tag_name: 'v1.2.3',
    name: 'v1.2.3',
    body: null,
    published_at: null,
    prerelease: false,
  },
  lastCheckedAt: 1000,
  lastAttemptAt: 1000,
  error: null,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  clearSystemUpdateStorage();
});

describe('normalizeSnapshot', () => {
  it('合法快照原样通过，tag 会先 trim', () => {
    const result = normalizeSnapshot(
      snapshotOf({
        release: { ...snapshotOf().release, tag_name: ' v1.2.3 ' },
      }),
      now(),
    );
    expect(result.error).toBeNull();
    expect(result.release.tag_name).toBe('v1.2.3');
  });

  it('error 键必须存在（写入方永远给 null 或错误码）', () => {
    const input = { ...snapshotOf() };
    delete input.error;
    expect(normalizeSnapshot(input, now())).toBeNull();
  });

  it('时间倒挂（检查晚于尝试、或尝试在未来）一律当没存过', () => {
    expect(
      normalizeSnapshot(
        snapshotOf({ lastCheckedAt: 5000, lastAttemptAt: 1000 }),
        now(),
      ),
    ).toBeNull();
    expect(
      normalizeSnapshot(snapshotOf({ lastAttemptAt: now() + 60000 }), now()),
    ).toBeNull();
    expect(
      normalizeSnapshot(snapshotOf({ lastAttemptAt: -1 }), now()),
    ).toBeNull();
  });

  it('未知错误码或坏掉的 release 结构要整体拒绝', () => {
    expect(normalizeSnapshot(snapshotOf({ error: 'boom' }), now())).toBeNull();
    expect(
      normalizeSnapshot(snapshotOf({ error: 'timeout' }), now()),
    ).not.toBeNull();
    expect(
      normalizeSnapshot(snapshotOf({ release: { tag_name: '' } }), now()),
    ).toBeNull();
    expect(
      normalizeSnapshot(
        snapshotOf({ release: { tag_name: 'v1', prerelease: 'yes' } }),
        now(),
      ),
    ).toBeNull();
    expect(normalizeSnapshot(null, now())).toBeNull();
    expect(normalizeSnapshot([], now())).toBeNull();
  });

  it('release 为 null 是合法状态（没有发行版，但确实检查过）', () => {
    const result = normalizeSnapshot(snapshotOf({ release: null }), now());
    expect(result.release).toBeNull();
  });
});

describe('snapshot 读写', () => {
  it('写入即落 localStorage，非法写入会清掉旧值', () => {
    expect(setSnapshot(snapshotOf())).not.toBeNull();
    expect(
      JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY)).release.tag_name,
    ).toBe('v1.2.3');
    expect(setSnapshot({ garbage: true })).toBeNull();
    expect(getSnapshot()).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_STORAGE_KEY)).toBeNull();
  });

  it('读到的脏数据不会被采用', () => {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, '{不是 json');
    expect(getSnapshot()).toBeNull();
    localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify(snapshotOf({ lastCheckedAt: 9e15 })),
    );
    expect(getSnapshot()).toBeNull();
  });
});

describe('按用户忽略版本', () => {
  it('用户 id 必须是正整数，否则拒绝写入', () => {
    expect(setVersionIgnored(0, 'v1.2.3', true)).toBe(false);
    expect(setVersionIgnored('abc', 'v1.2.3', true)).toBe(false);
    expect(setVersionIgnored(null, 'v1.2.3', true)).toBe(false);
    expect(setVersionIgnored('1', 'v1.2.3', true)).toBe(true);
    expect(getIgnoredVersions(1)).toEqual(['v1.2.3']);
  });

  it('重复设置同值返回 false，不产生多余写入', () => {
    expect(setVersionIgnored(2, 'v1.2.3', true)).toBe(true);
    const written = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    expect(setVersionIgnored(2, 'v1.2.3', true)).toBe(false);
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBe(written);
  });

  it('取消忽略后列表为空则整条记录删掉，不同用户互不影响', () => {
    setVersionIgnored(3, 'v1.0.0', true);
    setVersionIgnored(3, 'v1.2.3', true);
    setVersionIgnored(4, 'v1.2.3', true);
    expect(getIgnoredVersions(3)).toEqual(['v1.0.0', 'v1.2.3']);
    setVersionIgnored(3, 'v1.0.0', false);
    setVersionIgnored(3, 'v1.2.3', false);
    expect(getIgnoredVersions(3)).toEqual([]);
    expect(getIgnoredVersions(4)).toEqual(['v1.2.3']);
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY));
    expect('3' in stored.ignoredVersionsByUserId).toBe(false);
  });

  it('getIgnoredVersions 返回副本，调用方改动不回写 store', () => {
    setVersionIgnored(5, 'v1.2.3', true);
    const list = getIgnoredVersions(5);
    list.push('v9.9.9');
    expect(getIgnoredVersions(5)).toEqual(['v1.2.3']);
  });

  it('损坏的偏好数据整体丢弃', () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ ignoredVersionsByUserId: { 1: 'v1.2.3' } }),
    );
    expect(getIgnoredVersions(1)).toEqual([]);
    localStorage.setItem(PREFERENCES_STORAGE_KEY, '}{');
    expect(getIgnoredVersions(1)).toEqual([]);
  });
});

describe('订阅与跨标签页同步', () => {
  it('本标签页写入会通知订阅者', () => {
    const onSnapshot = vi.fn();
    const onPreferences = vi.fn();
    const unsubscribe = subscribeSystemUpdates({ onSnapshot, onPreferences });
    setSnapshot(snapshotOf({ lastCheckedAt: now(), lastAttemptAt: now() }));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    setVersionIgnored(6, 'v1.2.3', true);
    expect(onPreferences).toHaveBeenCalledTimes(1);
    unsubscribe();
    setSnapshot(snapshotOf({ lastCheckedAt: now(), lastAttemptAt: now() }));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('其它标签页写入（storage 事件）会重新加载两块数据', () => {
    const onSnapshot = vi.fn();
    const onPreferences = vi.fn();
    const unsubscribe = subscribeSystemUpdates({ onSnapshot, onPreferences });

    // 模拟另一个标签页直接写库：本标签页内存里还是旧值。
    localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify(
        snapshotOf({
          release: {
            tag_name: 'v2.0.0',
            name: null,
            body: null,
            published_at: null,
            prerelease: true,
          },
          lastCheckedAt: now(),
          lastAttemptAt: now(),
          error: null,
        }),
      ),
    );
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ ignoredVersionsByUserId: { 7: ['v2.0.0'] } }),
    );
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: SNAPSHOT_STORAGE_KEY,
        newValue: localStorage.getItem(SNAPSHOT_STORAGE_KEY),
      }),
    );

    expect(getSnapshot().release.tag_name).toBe('v2.0.0');
    expect(getIgnoredVersions(7)).toEqual(['v2.0.0']);
    expect(onSnapshot).toHaveBeenCalled();
    expect(onPreferences).toHaveBeenCalled();
    unsubscribe();
  });

  it('与本功能无关的 storage 事件不触发重载', () => {
    const onSnapshot = vi.fn();
    const unsubscribe = subscribeSystemUpdates({ onSnapshot });
    window.dispatchEvent(new StorageEvent('storage', { key: 'i18nextLng' }));
    expect(onSnapshot).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('存储被禁用时仍能工作', () => {
  it('localStorage 抛错只丢缓存，不抛给调用方', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    expect(() =>
      setSnapshot(snapshotOf({ lastCheckedAt: now(), lastAttemptAt: now() })),
    ).not.toThrow();
    expect(getSnapshot()).not.toBeNull();
    expect(setVersionIgnored(8, 'v1.2.3', true)).toBe(true);
    expect(getIgnoredVersions(8)).toEqual(['v1.2.3']);
    spy.mockRestore();
  });
});
