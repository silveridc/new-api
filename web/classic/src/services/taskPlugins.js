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

const BASE_URL = '/api/plugin/task';

/**
 * 任务插件「仍在使用」业务错误：禁用/删除插件时，后端返回
 * success=false 且 data 携带 { channels, in_flight_count }。
 * 对应后端 controller/task_plugin.go 中 SetTaskPluginStatus /
 * DeleteTaskPluginVersion 的冲突响应。
 */
export class TaskPluginUsageError extends Error {
  constructor(message, usage) {
    super(message);
    this.name = 'TaskPluginUsageError';
    this.usage = usage || { channels: [], in_flight_count: 0 };
  }
}

function isUsagePayload(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray(data.channels) &&
    typeof data.in_flight_count === 'number'
  );
}

/**
 * 解包 classic API 约定的 { success, message, data } 响应体。
 * 失败时识别「仍在使用」负载并抛出 TaskPluginUsageError，其余抛普通 Error。
 */
export function unwrapTaskPluginPayload(response) {
  const payload = response?.data;
  if (!payload || payload.success !== true) {
    const message = payload?.message || '请求失败';
    const data = payload?.data;
    if (isUsagePayload(data)) {
      throw new TaskPluginUsageError(message, data);
    }
    throw new Error(message);
  }
  return payload.data;
}

function encodeKey(key) {
  return encodeURIComponent(key);
}

/** GET /api/plugin/task —— 已安装插件列表（含 factory/override 分层与运行状态） */
export async function listTaskPlugins() {
  const response = await API.get(BASE_URL);
  return unwrapTaskPluginPayload(response) ?? [];
}

/** GET /api/plugin/task/:key —— 单个插件详情；version 可选（查看历史版本） */
export async function getTaskPlugin(key, version) {
  const response = await API.get(`${BASE_URL}/${encodeKey(key)}`, {
    params: version ? { version } : undefined,
  });
  return unwrapTaskPluginPayload(response);
}

/** GET /api/plugin/task/:key/versions —— 插件全部已保存版本 */
export async function getTaskPluginVersions(key) {
  const response = await API.get(`${BASE_URL}/${encodeKey(key)}/versions`);
  return unwrapTaskPluginPayload(response) ?? [];
}

/**
 * POST /api/plugin/task —— 上传/安装插件。
 * 后端 taskPluginUploadRequest 字段：source(必填)、enabled、remark、force、
 * sourceSha256、icon。force 仅用于显式覆盖路由冲突。
 */
export async function uploadTaskPlugin(payload) {
  const { source, remark, icon, enabled, sourceSha256, force } = payload || {};
  const body = { source };
  if (remark !== undefined) body.remark = remark;
  if (icon) body.icon = icon;
  if (enabled !== undefined) body.enabled = enabled;
  if (sourceSha256) body.sourceSha256 = sourceSha256;
  if (force) body.force = true;
  const response = await API.post(BASE_URL, body);
  return unwrapTaskPluginPayload(response);
}

/** POST /api/plugin/task/:key/activate —— 切换激活版本（body: { version }） */
export async function activateTaskPlugin(key, version) {
  const response = await API.post(`${BASE_URL}/${encodeKey(key)}/activate`, {
    version,
  });
  return unwrapTaskPluginPayload(response);
}

/**
 * POST /api/plugin/task/:key/status —— 启用/禁用插件。
 * options.cascade / options.force 以 query 参数传递（后端 c.Query 读取）。
 */
export async function setTaskPluginStatus(key, enabled, options) {
  const params = {};
  if (options?.cascade) params.cascade = true;
  if (options?.force) params.force = true;
  const response = await API.post(
    `${BASE_URL}/${encodeKey(key)}/status`,
    { enabled },
    { params: Object.keys(params).length ? params : undefined },
  );
  return unwrapTaskPluginPayload(response);
}

/** DELETE /api/plugin/task/:key/versions/:version —— 删除插件版本（force 覆盖占用） */
export async function deleteTaskPluginVersion(key, version, force = false) {
  const response = await API.delete(
    `${BASE_URL}/${encodeKey(key)}/versions/${encodeURIComponent(version)}`,
    { params: force ? { force: true } : undefined },
  );
  return unwrapTaskPluginPayload(response);
}

/**
 * POST /api/plugin/task/:key/dryrun —— 试运行插件钩子。
 * body: { hook(必填), member, args }。
 */
export async function dryRunTaskPlugin(key, request) {
  const body = { hook: request?.hook, args: request?.args ?? [] };
  if (request?.member) body.member = request.member;
  const response = await API.post(
    `${BASE_URL}/${encodeKey(key)}/dryrun`,
    body,
  );
  return unwrapTaskPluginPayload(response);
}

/** GET /api/plugin/task/marketplace/sources —— 市场源列表 */
export async function listMarketplaceSources() {
  const response = await API.get(`${BASE_URL}/marketplace/sources`);
  return unwrapTaskPluginPayload(response) ?? [];
}

/** PUT /api/plugin/task/marketplace/sources —— 更新市场源（body: [{name, index_url}]） */
export async function updateMarketplaceSources(sources) {
  const response = await API.put(
    `${BASE_URL}/marketplace/sources`,
    Array.isArray(sources) ? sources : [],
  );
  return unwrapTaskPluginPayload(response) ?? [];
}

/** GET /api/task_plugin_options —— 渠道绑定用的插件选项列表 */
export async function getTaskPluginBindOptions() {
  const response = await API.get('/api/task_plugin_options');
  return unwrapTaskPluginPayload(response) ?? [];
}

/** GET /api/option/ —— 读取 TaskPluginEnabled 总开关 */
export async function getTaskPluginEnabledOption() {
  const response = await API.get('/api/option/');
  const options = unwrapTaskPluginPayload(response) ?? [];
  const entry = options.find((option) => option.key === 'TaskPluginEnabled');
  return entry?.value === 'true';
}

/** PUT /api/option/ —— 写入 TaskPluginEnabled 总开关 */
export async function setTaskPluginEnabledOption(enabled) {
  const response = await API.put('/api/option/', {
    key: 'TaskPluginEnabled',
    value: String(enabled),
  });
  return unwrapTaskPluginPayload(response);
}
