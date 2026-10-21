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

import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { StatusContext } from '../../context/Status';
import { UserContext } from '../../context/User';
import { API } from '../../helpers/api';
import {
  getIgnoredVersions,
  getSnapshot,
  setSnapshot,
  setVersionIgnored,
  subscribeSystemUpdates,
} from '../../helpers/systemUpdateStore';
import {
  compareSystemVersions,
  fetchLatestSystemRelease,
  resolveRunningVersion,
  UpdateCheckError,
} from '../../services/systemUpdate';

/**
 * 系统更新检查 hook（对齐新版 web/src/features/system-update/use-system-update.ts）。
 *
 * 节流口径照抄上游，别「改进」：
 * - 最小间隔 1 小时（SYSTEM_UPDATE_INTERVAL），且**失败的尝试同样写进快照**，
 *   所以焦点切换、组件重挂载都不会再去锤 GitHub；只有 checkNow 能立刻重试。
 * - 只有「管理员 + 页面可见 + 浏览器在线」三者同时成立才发请求：
 *   访客不该为本站去访问 GitHub，普通用户看不到这个功能也不该消耗限流额度。
 * - 非管理员一律不发；角色变化（登出/切换）时取消在途请求。
 * - 每次检查顺手静默刷新 `/api/status`，让长期开着的标签页也能发现服务端升级了
 *   （后台任务失败不该弹 toast 打扰用户）。
 */

export const SYSTEM_UPDATE_INTERVAL = 60 * 60 * 1000;
const TICK_INTERVAL = 60 * 1000;

function isDocumentVisible() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function isStale(value) {
  return Date.now() - (value?.lastAttemptAt ?? 0) >= SYSTEM_UPDATE_INTERVAL;
}

/** 同一时刻只允许一趟 GitHub 请求，多个 hook 实例共享（对齐上游的查询去重）。 */
let sharedCheck = null;

/**
 * 真正执行一次检查。成功与失败都要落快照（失败只前移 lastAttemptAt、保留上次的
 * release），这是「焦点切换不会把接口锤爆」的关键；
 * 只有调用方主动 abort 的情况例外——那次检查根本没得出结论。
 */
async function performCheck(controller, applySnapshot) {
  const previous = getSnapshot();
  const now = Date.now();
  let next;
  try {
    const release = await fetchLatestSystemRelease(controller.signal);
    controller.signal.throwIfAborted();
    next = {
      release,
      lastCheckedAt: now,
      lastAttemptAt: now,
      error: null,
    };
  } catch (error) {
    if (controller.signal.aborted) return false;
    next = {
      release: previous?.release ?? null,
      lastCheckedAt: previous?.lastCheckedAt ?? 0,
      lastAttemptAt: now,
      error: error instanceof UpdateCheckError ? error.code : 'network',
    };
  }
  applySnapshot(setSnapshot(next));
  return true;
}

export function useSystemUpdate() {
  const [statusState, statusDispatch] = useContext(StatusContext);
  const [userState] = useContext(UserContext);

  const user = userState?.user;
  const isAdmin = Boolean(user && (user.role ?? 0) >= 10);
  const userId = user?.id;

  const [snapshot, setSnapshotState] = useState(() => getSnapshot());
  const [ignoredTags, setIgnoredTags] = useState(() =>
    getIgnoredVersions(userId),
  );
  const [checking, setChecking] = useState(false);
  const [online, setOnline] = useState(isBrowserOnline);

  const inFlightRef = useRef(false);
  const abortRef = useRef(null);
  // 回调要保持稳定引用（否则每分钟一次的定时器会反复重建），但判断必须用最新的
  // 管理员身份和在线状态，所以这两个值走 ref 读。
  const gatesRef = useRef({ isAdmin, online });
  gatesRef.current = { isAdmin, online };

  const runCheck = useCallback(async () => {
    const gates = gatesRef.current;
    if (!gates.isAdmin || !gates.online) return false;
    if (!isDocumentVisible()) return false;

    // 顶栏按钮和设置页各挂一个 hook 实例，同一时刻只允许一次 GitHub 请求：
    // 上游靠 TanStack Query 去重，classic 没有查询缓存，就用模块级单飞代替。
    if (sharedCheck) {
      try {
        await sharedCheck;
      } catch {
        /* 结果由发起方写进共享快照，订阅会把它同步给本实例。 */
      }
      return true;
    }

    inFlightRef.current = true;
    setChecking(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // 运行版本顺手刷新，但不阻塞 GitHub 请求（对齐上游的 void fetchQuery）。
    API.get('/api/status')
      .then((res) => {
        if (res.data?.success) {
          statusDispatch({ type: 'set', payload: res.data.data });
        }
      })
      .catch(() => {
        /* 版本刷新失败不影响更新检查本身。 */
      });

    const promise = performCheck(controller, setSnapshotState);
    sharedCheck = promise;
    try {
      return await promise;
    } finally {
      if (sharedCheck === promise) sharedCheck = null;
      inFlightRef.current = false;
      setChecking(false);
      abortRef.current = null;
    }
  }, [statusDispatch]);

  // 挂载时快照过期就查一次；之后每分钟看一次是否到点（到点且条件齐备才发）。
  useEffect(() => {
    if (!isAdmin) return undefined;
    if (isStale(getSnapshot())) void runCheck();
    const timer = setInterval(() => {
      if (isStale(getSnapshot())) void runCheck();
    }, TICK_INTERVAL);
    return () => clearInterval(timer);
  }, [isAdmin, runCheck]);

  // 回到前台 / 恢复网络时补一次检查；离线只需更新状态。
  useEffect(() => {
    const handleVisibility = () => {
      if (isDocumentVisible() && isStale(getSnapshot())) void runCheck();
    };
    const handleOnline = () => {
      setOnline(true);
      if (isStale(getSnapshot())) void runCheck();
    };
    const handleOffline = () => setOnline(false);
    const handleFocus = () => {
      if (isStale(getSnapshot())) void runCheck();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [runCheck]);

  // 快照与忽略列表可能被其它标签页改写，两者共用一个订阅（内部只挂一个 storage 监听）。
  useEffect(() => {
    setIgnoredTags(getIgnoredVersions(userId));
    return subscribeSystemUpdates({
      onSnapshot: () => setSnapshotState(getSnapshot()),
      onPreferences: () => setIgnoredTags(getIgnoredVersions(userId)),
    });
  }, [userId]);

  // 非管理员不该有在途请求，也不该留着别人的检查结果。
  useEffect(() => {
    if (isAdmin) return;
    abortRef.current?.abort();
    setSnapshotState(null);
  }, [isAdmin]);

  const currentVersion = resolveRunningVersion(statusState?.status?.version);
  const release = snapshot?.release ?? null;
  const comparison = compareSystemVersions(currentVersion, release?.tag_name);
  const hasUpdate = comparison === -1;
  const isIgnored = Boolean(
    release && userId && ignoredTags.includes(release.tag_name),
  );
  const shouldNotify = isAdmin && hasUpdate && !isIgnored;

  const setIgnored = useCallback(
    (ignored) => {
      if (!isAdmin || !userId || !release) return false;
      const changed = setVersionIgnored(userId, release.tag_name, ignored);
      if (changed) setIgnoredTags(getIgnoredVersions(userId));
      return changed;
    },
    [isAdmin, userId, release],
  );

  const checkNow = useCallback(async () => {
    if (!isAdmin || !gatesRef.current.online) return null;
    await runCheck();
    const result = getSnapshot();
    setSnapshotState(result);
    return result;
  }, [isAdmin, runCheck]);

  return {
    currentVersion,
    release,
    comparison,
    hasUpdate,
    isIgnored,
    shouldNotify,
    setIgnored,
    checking,
    online,
    snapshot,
    checkNow,
  };
}
