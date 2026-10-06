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

// 渠道 setting / settings 字段与新版后端契约的纯函数实现。
// 新版后端在 setting JSON（dto.ChannelSettings）里新增了
// responses_websocket_enabled / http_protocol / http2_connection_shards /
// task_plugin_key / task_extend_plugin_keys 字段，并在 settings JSON
// （dto.ChannelOtherSettings）里新增了 advanced_custom（类型 58）。
// 加载时保留未知字段、保存时只覆盖表单认识的字段，保证配置往返不丢。

export const CHANNEL_TYPE_NEW_API = 60;
export const CHANNEL_TYPE_TASK_PLUGIN = 61;
export const CHANNEL_TYPE_ADVANCED_CUSTOM = 58;

// 支持上游 Responses WebSocket 的渠道类型，与后端允许列表一致
export const RESPONSES_WEBSOCKET_CHANNEL_TYPES = new Set([1, 57, 58, 59, 60]);

export const HTTP_PROTOCOL_AUTO = 'auto';
export const HTTP_PROTOCOL_HTTP1 = 'http1';
export const MAX_HTTP2_CONNECTION_SHARDS = 8;

export function normalizeHttpProtocol(value) {
  return value === HTTP_PROTOCOL_HTTP1 ? HTTP_PROTOCOL_HTTP1 : HTTP_PROTOCOL_AUTO;
}

export function normalizeHttp2ConnectionShards(value) {
  const shards = Number(value);
  if (!Number.isInteger(shards) || shards < 1) {
    return 1;
  }
  if (shards > MAX_HTTP2_CONNECTION_SHARDS) {
    return MAX_HTTP2_CONNECTION_SHARDS;
  }
  return shards;
}

// New API (60) 渠道：单绑定并入扩展列表去重（与新版 readTaskExtendPluginKeys 一致）
export function readTaskExtendPluginKeys(channelType, parsedSetting) {
  if (channelType !== CHANNEL_TYPE_NEW_API || !parsedSetting) {
    return [];
  }
  const keys = Array.isArray(parsedSetting.task_extend_plugin_keys)
    ? parsedSetting.task_extend_plugin_keys.filter(
        (key) => typeof key === 'string' && key.trim() !== '',
      )
    : [];
  const single =
    typeof parsedSetting.task_plugin_key === 'string'
      ? parsedSetting.task_plugin_key.trim()
      : '';
  return [...new Set(single ? [single, ...keys] : keys)];
}

function parseObjectJSON(raw) {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    return {};
  }
}

/**
 * 解析渠道 setting JSON 字符串。
 * 返回 { fields, original }：fields 是表单认识的字段，original 是保留
 * 全部未知字段的原始对象（保存时先展开 original 再覆盖表单字段）。
 */
export function parseChannelSettingFields(settingStr, channelType) {
  const original = parseObjectJSON(settingStr);
  const fields = {
    force_format: original.force_format || false,
    thinking_to_content: original.thinking_to_content || false,
    proxy: original.proxy || '',
    pass_through_body_enabled: original.pass_through_body_enabled || false,
    responses_websocket_enabled: original.responses_websocket_enabled === true,
    http_protocol: normalizeHttpProtocol(original.http_protocol),
    http2_connection_shards: normalizeHttp2ConnectionShards(
      original.http2_connection_shards,
    ),
    task_plugin_key: original.task_plugin_key || '',
    task_extend_plugin_keys:
      channelType === CHANNEL_TYPE_NEW_API
        ? readTaskExtendPluginKeys(channelType, original)
        : Array.isArray(original.task_extend_plugin_keys)
          ? original.task_extend_plugin_keys
          : [],
    system_prompt: original.system_prompt || '',
    system_prompt_override: original.system_prompt_override || false,
  };
  return { fields, original };
}

/**
 * 保存时构建渠道 setting JSON：
 * 先展开加载时保留的原始对象（未知字段原样带回），再覆盖表单字段。
 * 缺省值不写入（http_protocol 仅在 http1 时写入、分片数仅在 >1 时写入），
 * 与新版 buildSettingJSON 的行为保持一致。
 */
export function buildChannelSettingJSON(originalSetting, formData) {
  const settingObj = { ...(originalSetting || {}) };

  settingObj.force_format = formData.force_format || false;
  settingObj.thinking_to_content = formData.thinking_to_content || false;
  settingObj.proxy = formData.proxy || '';
  settingObj.pass_through_body_enabled =
    formData.pass_through_body_enabled || false;
  settingObj.system_prompt = formData.system_prompt || '';
  settingObj.system_prompt_override = formData.system_prompt_override || false;

  // Responses WebSocket 仅在支持的渠道类型上生效
  settingObj.responses_websocket_enabled =
    RESPONSES_WEBSOCKET_CHANNEL_TYPES.has(formData.type) &&
    formData.responses_websocket_enabled === true;

  const protocol = normalizeHttpProtocol(formData.http_protocol);
  if (protocol === HTTP_PROTOCOL_HTTP1) {
    settingObj.http_protocol = HTTP_PROTOCOL_HTTP1;
    delete settingObj.http2_connection_shards;
  } else {
    const shards = normalizeHttp2ConnectionShards(
      formData.http2_connection_shards,
    );
    if (shards > 1) {
      settingObj.http2_connection_shards = shards;
    } else {
      delete settingObj.http2_connection_shards;
    }
    delete settingObj.http_protocol;
  }

  // 任务插件绑定（61）与 New API 扩展插件（60）；
  // undefined 在 JSON.stringify 时被丢弃，等价新版 buildSettingJSON
  settingObj.task_plugin_key =
    formData.type === CHANNEL_TYPE_TASK_PLUGIN
      ? String(formData.task_plugin_key || '').trim()
      : undefined;
  settingObj.task_extend_plugin_keys =
    formData.type === CHANNEL_TYPE_NEW_API &&
    Array.isArray(formData.task_extend_plugin_keys) &&
    formData.task_extend_plugin_keys.length > 0
      ? formData.task_extend_plugin_keys
      : undefined;

  return JSON.stringify(settingObj);
}

/**
 * 从渠道 settings JSON 字符串中读取 advanced_custom（类型 58 路由配置，
 * 对象存储），序列化为编辑用的格式化字符串。
 */
export function parseAdvancedCustomFormValue(settingsStr) {
  const parsed = parseObjectJSON(settingsStr);
  if (
    parsed.advanced_custom &&
    typeof parsed.advanced_custom === 'object' &&
    !Array.isArray(parsed.advanced_custom)
  ) {
    return JSON.stringify(parsed.advanced_custom, null, 2);
  }
  return '';
}

/**
 * 校验 advanced_custom 编辑文本：必须是包含非空 advanced_routes
 * 数组的 JSON 对象。返回 { ok, config | message }。
 */
export function validateAdvancedCustomRaw(rawStr) {
  const raw = String(rawStr || '').trim();
  if (raw === '') {
    return { ok: false, message: 'empty' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.advanced_routes) &&
      parsed.advanced_routes.length > 0
    ) {
      return { ok: true, config: parsed };
    }
  } catch (error) {
    // 落到 invalid
  }
  return { ok: false, message: 'invalid' };
}
