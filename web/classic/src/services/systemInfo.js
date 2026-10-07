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

import { API } from '../helpers';

/**
 * 系统信息与后台任务服务。契约来源：
 * - 新版前端 web/src/features/system-info/{api.ts,types.ts,constants.ts}
 *   与 web/src/features/system-settings/types.ts
 * - 后端 router/api-router.go:331-344 /api/system-task 组（RootAuth）
 *   与 router/api-router.go:340-344 /api/system-info 组（RootAuth）
 * - 后端 controller/system_task.go:68 ListSystemTasks（query: scope/type/status/
 *   offset/limit；响应 { success, message, data: SystemTaskResponse[], total }）
 * - 后端 controller/system_info.go:13 ListSystemInstances（响应 data:
 *   SystemInstanceResponse[]）、:33 DeleteStaleSystemInstances、:45 DeleteStaleSystemInstance
 * - 后端 model/system_task.go:51 SystemTaskResponse / :178 SystemTaskFilter
 * - 后端 model/system_instance.go:26 SystemInstanceResponse。
 *
 * SystemTaskResponse: { id, task_id, type, status(pending|running|succeeded|failed),
 *   payload, state, result, error, locked_by, created_at, updated_at }（时间戳为秒）
 * SystemInstanceResponse: { node_name, status(online|stale), stale_after_seconds,
 *   started_at, last_seen_at, info: { node?, role?, runtime?, host?, resources? } }
 */

export const SYSTEM_TASK_STATUS_OPTIONS = [
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '运行中' },
  { value: 'succeeded', label: '已成功' },
  { value: 'failed', label: '已失败' },
];

export const SYSTEM_TASK_TYPE_LABEL = {
  log_cleanup: '日志清理',
  channel_test: '批量渠道测试',
  model_update: '批量上游模型更新',
  midjourney_poll: '绘图任务轮询',
  async_task_poll: '异步任务轮询',
};

export const SYSTEM_TASK_SCOPE = {
  ACTIVE: 'active',
  HISTORY: 'history',
};

export const DEFAULT_SYSTEM_TASK_LIMIT = 100;

export function systemTaskTypeLabel(type) {
  return SYSTEM_TASK_TYPE_LABEL[type] || type || '-';
}

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isSystemTaskStatus(value) {
  return SYSTEM_TASK_STATUS_OPTIONS.some((option) => option.value === value);
}

/**
 * task.state.progress（0..100，可能缺失）；用于进度条。
 */
export function extractTaskProgress(task) {
  const progress = task?.state?.progress;
  const n = Number(progress);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * GET /api/system-info/instances。返回解包后的 data（实例数组）。
 */
export async function listSystemInstances() {
  const res = await API.get('/api/system-info/instances');
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '获取系统实例失败');
  }
  return Array.isArray(data) ? data : [];
}

/**
 * DELETE /api/system-info/stale-instances。返回删除数量。
 */
export async function deleteStaleSystemInstances() {
  const res = await API.delete('/api/system-info/stale-instances');
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '清理失联实例失败');
  }
  return Number(data?.deleted_count || 0);
}

/**
 * DELETE /api/system-info/instances/:node_name。返回删除数量。
 */
export async function deleteStaleSystemInstance(nodeName) {
  const res = await API.delete(
    `/api/system-info/instances/${encodeURIComponent(nodeName)}`,
  );
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '删除实例失败');
  }
  return Number(data?.deleted_count || 0);
}

/**
 * GET /api/system-task/list。返回 { tasks, total }。
 * filters: { scope: 'active'|'history'|'', type, status, offset }；空值不发送。
 */
export function buildSystemTaskQuery(limit, filters = {}) {
  const params = {
    limit: limit && limit > 0 ? limit : DEFAULT_SYSTEM_TASK_LIMIT,
  };
  if (filters.scope) params.scope = filters.scope;
  if (filters.type) params.type = filters.type;
  if (filters.status && isSystemTaskStatus(filters.status))
    params.status = filters.status;
  if (filters.offset && filters.offset > 0) params.offset = filters.offset;
  return params;
}

export async function listSystemTasks(limit, filters = {}) {
  const res = await API.get('/api/system-task/list', {
    params: buildSystemTaskQuery(limit, filters),
  });
  const { success, message, data, total } = res.data || {};
  if (!success) {
    throw new Error(message || '获取系统任务失败');
  }
  return {
    tasks: Array.isArray(data) ? data : [],
    total: Number(total || 0),
  };
}

/**
 * DELETE /api/system-task/history?type=&status=。返回删除数量。
 */
export async function deleteSystemTaskHistory(filters = {}) {
  const params = {};
  if (filters.type) params.type = filters.type;
  if (filters.status && isSystemTaskStatus(filters.status))
    params.status = filters.status;
  const res = await API.delete('/api/system-task/history', { params });
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '清理任务历史失败');
  }
  return Number(data?.deleted_count || 0);
}

/**
 * 实例表数据源。节点名优先取 info.node.name，回退 node_name。
 */
export function buildInstanceRows(instances) {
  return (Array.isArray(instances) ? instances : []).map((inst, index) => ({
    key: inst?.node_name || `instance-${index}`,
    node_name: inst?.node_name || '-',
    display_name: inst?.info?.node?.name || inst?.node_name || '-',
    role: inst?.info?.role?.is_master ? 'master' : 'worker',
    version: inst?.info?.runtime?.version || '-',
    platform:
      [inst?.info?.runtime?.goos, inst?.info?.runtime?.goarch]
        .filter(Boolean)
        .join('/') || '-',
    hostname: inst?.info?.host?.hostname || '-',
    status: inst?.status === 'stale' ? 'stale' : 'online',
    cpu_percent: toFiniteOrNull(inst?.info?.resources?.cpu?.usage_percent),
    memory_percent: toFiniteOrNull(inst?.info?.resources?.memory?.usage_percent),
    started_at: Number(inst?.started_at || 0),
    last_seen_at: Number(inst?.last_seen_at || 0),
    stale_after_seconds: Number(inst?.stale_after_seconds || 0),
  }));
}

/**
 * 任务表数据源。
 */
export function buildSystemTaskRows(tasks) {
  return (Array.isArray(tasks) ? tasks : []).map((task, index) => ({
    key: task?.task_id || `task-${index}`,
    task_id: task?.task_id || '-',
    type: task?.type || '-',
    type_label: systemTaskTypeLabel(task?.type),
    status: task?.status || 'pending',
    progress: extractTaskProgress(task),
    locked_by: task?.locked_by || '-',
    error: task?.error || '',
    result: task?.result ?? null,
    payload: task?.payload ?? null,
    created_at: Number(task?.created_at || 0),
    updated_at: Number(task?.updated_at || 0),
  }));
}
