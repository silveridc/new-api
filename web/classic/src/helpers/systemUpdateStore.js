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
 * 系统更新的本地持久化层（对齐新版 web/src/features/system-update/store.ts）。
 *
 * 两块存储，别混用：
 * - `system-update:v1` 是「最近一次检查的结果快照」，全站共享、与用户无关，
 *   写它的是检查逻辑，读它的是所有界面；失败的尝试也要写（lastAttemptAt 前移），
 *   这样切标签页/重挂载不会把 GitHub 接口再锤一遍。
 * - `system-update-preferences:v1` 是「按用户 id 忽略哪些 tag」，多标签页要互相同步，
 *   所以额外监听 window 的 storage 事件（该事件只在**其它**标签页写入时触发）。
 *
 * 读到的数据必须整体校验后再用：schema 不合就退回空态，宁当没存过，
 * 也不能让脏数据把「有更新」的判定带偏。localStorage 在隐私模式/被禁用时会抛，
 * 所有访问都要 try/catch —— 存储不可用只是丢了缓存，功能还得能用。
 */

import { UPDATE_CHECK_ERROR_CODES } from '../services/systemUpdate';

export const SNAPSHOT_STORAGE_KEY = 'system-update:v1';
export const PREFERENCES_STORAGE_KEY = 'system-update-preferences:v1';

const ERROR_CODES = new Set(UPDATE_CHECK_ERROR_CODES);
const USER_ID_PATTERN = /^[1-9]\d*$/;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存储被禁用时只用内存态。 */
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 同上。 */
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRelease(value) {
  if (!isPlainObject(value)) return null;
  if (typeof value.tag_name !== 'string' || !value.tag_name.trim()) return null;
  if (typeof value.prerelease !== 'boolean') return null;
  const name = value.name ?? null;
  const body = value.body ?? null;
  const publishedAt = value.published_at ?? null;
  if (
    (name !== null && typeof name !== 'string') ||
    (body !== null && typeof body !== 'string') ||
    (publishedAt !== null &&
      (typeof publishedAt !== 'string' ||
        Number.isNaN(Date.parse(publishedAt))))
  ) {
    return null;
  }
  return {
    tag_name: value.tag_name.trim(),
    name,
    body,
    published_at: publishedAt,
    prerelease: value.prerelease,
  };
}

/**
 * 快照校验（对齐 updateSnapshotSchema 的 refine：lastCheckedAt <= lastAttemptAt <= now）。
 * 时间倒挂说明数据被手改过或跨了时钟，直接当作没存过。
 */
export function normalizeSnapshot(value, now = Date.now()) {
  if (!isPlainObject(value)) return null;
  if (!('release' in value) || !Number.isFinite(value.lastCheckedAt))
    return null;
  if (!Number.isFinite(value.lastAttemptAt)) return null;
  if (
    value.lastCheckedAt < 0 ||
    value.lastAttemptAt < 0 ||
    value.lastCheckedAt > value.lastAttemptAt ||
    value.lastAttemptAt > now
  ) {
    return null;
  }
  if (value.release !== null && !normalizeRelease(value.release)) return null;
  // error 键必须存在（对齐 zod 的 nullable 而非 optional）：写入方永远会给出
  // null 或四种错误码之一，缺键说明这是别的形状的数据，整体拒绝。
  if (value.error !== null && !ERROR_CODES.has(value.error)) return null;
  return {
    release: value.release === null ? null : normalizeRelease(value.release),
    lastCheckedAt: value.lastCheckedAt,
    lastAttemptAt: value.lastAttemptAt,
    error: value.error,
  };
}

let snapshot = null;
let snapshotLoaded = false;
const snapshotListeners = new Set();

function loadSnapshot() {
  if (snapshotLoaded) return;
  snapshotLoaded = true;
  const raw = safeGet(SNAPSHOT_STORAGE_KEY);
  if (!raw) return;
  try {
    snapshot = normalizeSnapshot(JSON.parse(raw));
  } catch {
    snapshot = null;
  }
}

export function getSnapshot() {
  loadSnapshot();
  return snapshot;
}

/** 成功与失败都写：失败时保留上一次的 release，只把 lastAttemptAt 前移。 */
export function setSnapshot(next) {
  const valid = normalizeSnapshot(next);
  snapshot = valid;
  snapshotLoaded = true;
  if (!valid) {
    safeRemove(SNAPSHOT_STORAGE_KEY);
  } else {
    safeSet(SNAPSHOT_STORAGE_KEY, JSON.stringify(valid));
  }
  emit(snapshotListeners);
  return valid;
}

export function subscribeSnapshot(listener) {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

let ignoredByUserId = {};
let preferencesLoaded = false;
const preferenceListeners = new Set();
let storageWatchers = 0;

function normalizePreferences(value) {
  if (!isPlainObject(value)) return null;
  const source = value.ignoredVersionsByUserId;
  if (!isPlainObject(source)) return null;
  const result = {};
  for (const [userId, tags] of Object.entries(source)) {
    if (!USER_ID_PATTERN.test(userId) || !Array.isArray(tags)) return null;
    const cleaned = [];
    for (const tag of tags) {
      if (typeof tag !== 'string' || !tag) return null;
      if (!cleaned.includes(tag)) cleaned.push(tag);
    }
    if (cleaned.length) result[userId] = cleaned;
  }
  return result;
}

function loadPreferences() {
  if (preferencesLoaded) return;
  preferencesLoaded = true;
  const raw = safeGet(PREFERENCES_STORAGE_KEY);
  if (!raw) return;
  try {
    ignoredByUserId = normalizePreferences(JSON.parse(raw)) || {};
  } catch {
    ignoredByUserId = {};
  }
}

/** 返回该用户忽略的 tag 列表（副本，调用方改动不影响 store）。 */
export function getIgnoredVersions(userId) {
  loadPreferences();
  if (!userId) return [];
  return [...(ignoredByUserId[String(userId)] || [])];
}

/**
 * 设置忽略状态。返回值表示是否真的发生了变化——新版用同一个判断跳过无谓的写入，
 * 避免每次打开对话框都往 localStorage 砸一发并触发跨标签页广播。
 */
export function setVersionIgnored(userId, tag, ignored) {
  loadPreferences();
  if (!userId || !tag || !USER_ID_PATTERN.test(String(userId))) return false;
  const key = String(userId);
  const tags = ignoredByUserId[key] || [];
  if (tags.includes(tag) === ignored) return false;

  const nextTags = ignored ? [...tags, tag] : tags.filter((v) => v !== tag);
  ignoredByUserId = { ...ignoredByUserId };
  if (nextTags.length) {
    ignoredByUserId[key] = nextTags;
  } else {
    delete ignoredByUserId[key];
  }
  safeSet(
    PREFERENCES_STORAGE_KEY,
    JSON.stringify({ ignoredVersionsByUserId: ignoredByUserId }),
  );
  emit(preferenceListeners);
  return true;
}

function emit(listeners) {
  for (const listener of [...listeners]) {
    listener();
  }
}

function handleStorageEvent(event) {
  // event.key === null 是「整站存储被清空」，这时也必须重新加载。
  if (
    event.key === PREFERENCES_STORAGE_KEY ||
    event.key === SNAPSHOT_STORAGE_KEY ||
    event.key === null
  ) {
    preferencesLoaded = false;
    loadPreferences();
    snapshotLoaded = false;
    loadSnapshot();
    emit(preferenceListeners);
    emit(snapshotListeners);
  }
}

/**
 * 顶栏按钮和设置页共用同一份数据，所以 window 的 storage 监听只注册一个（引用计数），
 * 最后一个订阅者退订时再摘掉。
 */
export function subscribeSystemUpdates({ onSnapshot, onPreferences }) {
  const unsubscribers = [];
  if (onSnapshot) {
    loadSnapshot();
    unsubscribers.push(subscribeSnapshot(onSnapshot));
  }
  if (onPreferences) {
    loadPreferences();
    unsubscribers.push(subscribePreferences(onPreferences));
  }
  if (storageWatchers === 0) {
    window.addEventListener('storage', handleStorageEvent);
    // 首次挂载即对齐一次：另一标签页可能已经写过而本标签页还没读过。
    preferencesLoaded = false;
    loadPreferences();
    snapshotLoaded = false;
    loadSnapshot();
  }
  storageWatchers += 1;

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    storageWatchers -= 1;
    if (storageWatchers === 0) {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

function subscribePreferences(listener) {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

/**
 * 清空两块数据并**放弃内存缓存**（下次读取会重新回源 localStorage）。
 * 生产路径不用它，单测靠它把模块级状态复位到「刚打开页面」的样子。
 */
export function clearSystemUpdateStorage() {
  snapshot = null;
  snapshotLoaded = false;
  ignoredByUserId = {};
  preferencesLoaded = false;
  safeRemove(SNAPSHOT_STORAGE_KEY);
  safeRemove(PREFERENCES_STORAGE_KEY);
  emit(snapshotListeners);
  emit(preferenceListeners);
}
