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

import axios from 'axios';

const baseURL = import.meta.env.VITE_REACT_APP_SERVER_URL || '';
const authClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Cache-Control': 'no-store' },
});

let authBundle = null;
let refreshPromise = null;

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function isAuthBundle(value) {
  return (
    isRecord(value) &&
    typeof value.access_token === 'string' &&
    value.access_token.length > 0 &&
    isRecord(value.user) &&
    Number.isInteger(value.user.id) &&
    isRecord(value.session) &&
    typeof value.session.sid === 'string'
  );
}

export function getAuthBundle() {
  return authBundle;
}

export function getAccessToken() {
  return authBundle?.access_token || '';
}

export function getAuthUser(value) {
  return value?.user && isRecord(value.user) ? value.user : isRecord(value) ? value : null;
}

export function applyAuthBundle(value) {
  if (!isAuthBundle(value)) return null;
  authBundle = value;
  return value.user;
}

export function applyAuthRotation(value) {
  if (!isRecord(value) || typeof value.access_token !== 'string') return null;
  if (!authBundle || !isRecord(value.session)) return null;
  if (value.session.sid !== authBundle.session.sid) return null;
  authBundle = {
    ...authBundle,
    access_token: value.access_token,
    token_type: value.token_type || 'Bearer',
    access_expires_at: value.access_expires_at,
    session: value.session,
  };
  return authBundle.user;
}

export function clearAuth() {
  authBundle = null;
  try {
    localStorage.removeItem('user');
  } catch {
    // Storage is optional.
  }
}

export async function refreshAuthentication() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = authClient
    .post('/api/user/auth/refresh', undefined, {
      headers: authBundle?.session?.sid
        ? { 'X-Auth-Session': authBundle.session.sid }
        : undefined,
    })
    .then((response) => {
      const bundle = response.data?.data;
      const user = applyAuthBundle(bundle);
      if (!user) throw new Error('Invalid authentication response');
      return bundle;
    })
    .catch((error) => {
      if (error.response?.status === 401) clearAuth();
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function getFreshAuthHeaders() {
  if (!getAccessToken()) await refreshAuthentication();
  return getCommonAuthHeaders();
}

/**
 * 供绕过 API 客户端的裸请求（fetch/SSE）使用：访问令牌缺失或临近过期时
 * 先刷新，保证这些请求也能拿到有效令牌（API 客户端的 401 自动刷新不会
 * 覆盖裸请求）。刷新失败时回退到现有令牌，由服务端返回 401 触发上层提示。
 */
export async function ensureAuthHeaders(minValiditySeconds = 60) {
  const expiresAt = Number(authBundle?.access_expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  if (
    !getAccessToken() ||
    (expiresAt > 0 && expiresAt - now <= minValiditySeconds)
  ) {
    try {
      await refreshAuthentication();
    } catch {
      // 保持现有令牌，请求失败由调用方处理。
    }
  }
  return getCommonAuthHeaders();
}

export function getCommonAuthHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function logout() {
  const sid = authBundle?.session?.sid;
  try {
    await authClient.post('/api/user/auth/logout', undefined, {
      headers: sid ? { 'X-Auth-Session': sid, ...getCommonAuthHeaders() } : getCommonAuthHeaders(),
    });
  } finally {
    clearAuth();
  }
}

export function storeUserProfile(user) {
  if (!user) return;
  try {
    localStorage.setItem('user', JSON.stringify(user));
  } catch {
    // Storage is optional.
  }
}
