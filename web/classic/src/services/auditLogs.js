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

import { API } from '../helpers';

/**
 * 审计日志服务。契约来源：
 * - 新版前端 web/src/features/usage-logs/audit/api.ts
 * - 后端 controller/access_token.go GetAuditLogs（router/api-router.go:320-321）
 *   GET /api/audit（AdminAuth + AuditRead 权限）、GET /api/audit/self（UserAuth）。
 * 响应 data 为 PageInfo：{ page, page_size, total, items }。
 */

export const AUDIT_CATEGORIES = [
  { value: 'login', label: '登录' },
  { value: 'security', label: '账户安全' },
  { value: 'operation', label: '操作审计' },
  { value: 'access_token', label: '访问令牌' },
];

export const DEFAULT_AUDIT_PAGE_SIZE = 20;

/**
 * 把筛选状态转换为后端查询参数。空值不发送；
 * success 只接受 'true'/'false'；时间戳为秒。
 * 后端校验失败（非法 category / success / 时间范围）会直接 400。
 */
export function buildAuditQueryParams(filters = {}) {
  const params = {
    p: filters.p && filters.p > 0 ? filters.p : 1,
    page_size:
      filters.page_size && filters.page_size > 0
        ? filters.page_size
        : DEFAULT_AUDIT_PAGE_SIZE,
  };
  const optional = {
    start_timestamp: filters.start_timestamp,
    end_timestamp: filters.end_timestamp,
    success: filters.success,
    category: filters.category,
    token_ref: filters.token_ref,
    exclude_token_ref: filters.exclude_token_ref,
    username: filters.username,
    request_id: filters.request_id,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value === undefined || value === null || value === '') continue;
    // 筛选栏的「全部」哨兵值不发送
    if ((key === 'success' || key === 'category') && value === 'all') continue;
    params[key] = value;
  }
  return params;
}

/**
 * scope: 'all' -> /api/audit（管理员），'self' -> /api/audit/self。
 * 返回 { items, total, page, page_size }；失败时抛错。
 * 非 2xx（如权限被收回的 403）会以 axios 错误抛出，调用方可读
 * error.response.status 判断是否回退到 self 视图。
 */
export async function getAuditLogs(scope, params) {
  const url = scope === 'all' ? '/api/audit' : '/api/audit/self';
  let response;
  try {
    response = await API.get(url, { params });
  } catch (requestError) {
    const message =
      requestError?.response?.data?.message ||
      requestError?.message ||
      '审计记录加载失败';
    const wrapped = new Error(message);
    wrapped.status = requestError?.response?.status;
    throw wrapped;
  }
  const payload = response?.data;
  if (!payload || payload.success !== true || !payload.data) {
    throw new Error(payload?.message || '审计记录加载失败');
  }
  return {
    items: Array.isArray(payload.data.items) ? payload.data.items : [],
    total: payload.data.total ?? 0,
    page: payload.data.page,
    page_size: payload.data.page_size,
  };
}

const AUDIT_ROLE_NAMES = {
  1: '普通用户',
  10: '管理员',
  100: '超级管理员',
};

export function auditRoleName(role) {
  return AUDIT_ROLE_NAMES[role] || String(role ?? '');
}

function isDetailObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 把单条审计日志的 other（AuditOther JSON）拆解为详情弹窗可渲染的字段组。
 * 对应新版 audit/lib/audit-details.ts 的简化移植：
 * - op: { action, params }
 * - admin_info: 操作者（admin_id/admin_username/admin_role/auth_method）+
 *   扩展字段（request_policy / quota_saturation / task_plugin 等，字段要全）
 * - audit_info: method/route/status/success
 * - extra: 其余全部透传展示
 */
export function buildAuditDetails(entry = {}) {
  const metadata = isDetailObject(entry.other) ? entry.other : {};
  const op = isDetailObject(metadata.op) ? metadata.op : null;
  const opParams = isDetailObject(op?.params) ? { ...op.params } : {};
  const admin = isDetailObject(metadata.admin_info)
    ? metadata.admin_info
    : null;
  const auditInfo = isDetailObject(metadata.audit_info)
    ? metadata.audit_info
    : null;
  const rootInfo = isDetailObject(metadata.root_info)
    ? metadata.root_info
    : null;

  const actorName = admin?.admin_username || entry.username || '';
  const actorId = admin?.admin_id ?? entry.user_id;
  let actor = actorName;
  if (actorId !== undefined && actorId !== null && actorId !== '') {
    actor = actorName ? `${actorName} (ID: ${actorId})` : `ID: ${actorId}`;
  }

  // admin_info 中除身份字段之外的扩展字段（request_policy、quota_saturation、
  // task_plugin 等）全部保留展示，避免漏字段。
  const adminExtra = {};
  if (admin) {
    for (const [key, value] of Object.entries(admin)) {
      if (
        !['admin_id', 'admin_username', 'admin_role', 'auth_method'].includes(
          key,
        )
      ) {
        adminExtra[key] = value;
      }
    }
  }

  // params 展开为键值字段（op 专用参数），跳过已单独展示的目标字段
  const fields = Object.entries(opParams)
    .filter(([key]) => !['id', 'name', 'username'].includes(key))
    .map(([key, value]) => ({ label: key, value }));

  const extra = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (['op', 'admin_info', 'audit_info', 'root_info'].includes(key)) continue;
    extra[key] = value;
  }
  if (rootInfo) {
    extra.root_info = rootInfo;
  }
  if (Object.keys(adminExtra).length) {
    extra.admin_info = adminExtra;
  }

  return {
    action: op?.action || entry.action || '',
    summary: entry.content || op?.action || entry.action || '',
    actor,
    actorRole: AUDIT_ROLE_NAMES[entry.actor_role] || '',
    authentication: admin?.auth_method || entry.auth_method || '',
    paramsFields: fields,
    auditInfo,
    extra,
    metadataUnavailable:
      !op && !admin && !auditInfo && Object.keys(extra).length === 0,
  };
}

/** 插件平台名（admin_info.task_plugin 或 root_info.task_plugin 的 name/key/version） */
export function describeAuditTaskPlugin(entry = {}) {
  const metadata = isDetailObject(entry.other) ? entry.other : {};
  const admin = isDetailObject(metadata.admin_info) ? metadata.admin_info : null;
  const root = isDetailObject(metadata.root_info) ? metadata.root_info : null;
  const plugin = admin?.task_plugin || root?.task_plugin || null;
  if (!plugin || typeof plugin !== 'object') return null;
  return {
    key: plugin.key ?? '',
    name: plugin.name ?? plugin.key ?? '',
    version: plugin.version ?? '',
    platform: plugin.platform ?? plugin.name ?? plugin.key ?? '',
  };
}
