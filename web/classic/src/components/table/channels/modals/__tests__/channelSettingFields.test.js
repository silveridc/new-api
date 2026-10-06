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

import { describe, it, expect } from 'vitest';
import {
  parseChannelSettingFields,
  buildChannelSettingJSON,
  parseAdvancedCustomFormValue,
  validateAdvancedCustomRaw,
  normalizeHttpProtocol,
  normalizeHttp2ConnectionShards,
  RESPONSES_WEBSOCKET_CHANNEL_TYPES,
  CHANNEL_TYPE_NEW_API,
  CHANNEL_TYPE_TASK_PLUGIN,
  CHANNEL_TYPE_ADVANCED_CUSTOM,
} from '../channelSettingFields';
import { CHANNEL_OPTIONS } from '../../../../../constants/channel.constants';

const TYPE = 1;

describe('channelSettingFields：setting 未知字段往返', () => {
  it('解析时保留全部未知字段，并提取表单认识的字段', () => {
    const raw = JSON.stringify({
      force_format: true,
      proxy: 'socks5://u:p@h:1080',
      responses_websocket_enabled: true,
      http_protocol: 'http1',
      http2_connection_shards: 4,
      task_plugin_key: 'sunoapi',
      // 新版后端未来新增的未知配置
      some_future_flag: { nested: [1, 2, 3] },
    });
    const { fields, original } = parseChannelSettingFields(raw, TYPE);

    expect(fields.force_format).toBe(true);
    expect(fields.proxy).toBe('socks5://u:p@h:1080');
    expect(fields.responses_websocket_enabled).toBe(true);
    expect(fields.http_protocol).toBe('http1');
    expect(fields.http2_connection_shards).toBe(4);
    expect(fields.task_plugin_key).toBe('sunoapi');
    expect(fields.task_extend_plugin_keys).toEqual([]);
    expect(original.some_future_flag).toEqual({ nested: [1, 2, 3] });
  });

  it('非法 JSON 与空值回退到默认值', () => {
    const { fields, original } = parseChannelSettingFields('{oops', TYPE);
    expect(fields.force_format).toBe(false);
    expect(fields.http_protocol).toBe('auto');
    expect(fields.http2_connection_shards).toBe(1);
    expect(fields.responses_websocket_enabled).toBe(false);
    expect(original).toEqual({});

    const empty = parseChannelSettingFields('', TYPE);
    expect(empty.fields.proxy).toBe('');
    expect(empty.original).toEqual({});
  });

  it('保存时未知字段原样带回、表单字段覆盖', () => {
    const original = parseChannelSettingFields(
      JSON.stringify({
        force_format: false,
        some_future_flag: 'keep-me',
        another: { deep: true },
      }),
      TYPE,
    );

    const saved = buildChannelSettingJSON(original.original, {
      type: TYPE,
      force_format: true,
      thinking_to_content: false,
      proxy: 'socks5://new:1',
      pass_through_body_enabled: true,
      system_prompt: 'hi',
      system_prompt_override: true,
      responses_websocket_enabled: true,
      http_protocol: 'auto',
      http2_connection_shards: 1,
      task_plugin_key: '',
      task_extend_plugin_keys: [],
    });

    const parsed = JSON.parse(saved);
    // 未知字段往返保留
    expect(parsed.some_future_flag).toBe('keep-me');
    expect(parsed.another).toEqual({ deep: true });
    // 表单字段已覆盖
    expect(parsed.force_format).toBe(true);
    expect(parsed.proxy).toBe('socks5://new:1');
    expect(parsed.pass_through_body_enabled).toBe(true);
    expect(parsed.system_prompt).toBe('hi');
    expect(parsed.system_prompt_override).toBe(true);
  });

  it('完整往返：parse -> build -> parse 保持一致', () => {
    const raw = JSON.stringify({
      force_format: true,
      proxy: 'p1',
      custom_field: 'v1',
      http2_connection_shards: 3,
    });
    const first = parseChannelSettingFields(raw, TYPE);
    const saved = buildChannelSettingJSON(first.original, {
      type: TYPE,
      ...first.fields,
      responses_websocket_enabled: true,
    });
    const second = parseChannelSettingFields(saved, TYPE);

    expect(second.fields.force_format).toBe(true);
    expect(second.fields.proxy).toBe('p1');
    expect(second.fields.responses_websocket_enabled).toBe(true);
    expect(second.fields.http_protocol).toBe('auto');
    expect(second.fields.http2_connection_shards).toBe(3);
    expect(second.original.custom_field).toBe('v1');
  });

  it('http1 模式下分片数保存时强制归 1', () => {
    const first = parseChannelSettingFields(
      JSON.stringify({ http_protocol: 'http1', http2_connection_shards: 3 }),
      TYPE,
    );
    const saved = JSON.parse(
      buildChannelSettingJSON(first.original, {
        type: TYPE,
        ...first.fields,
      }),
    );
    expect(saved.http_protocol).toBe('http1');
    expect('http2_connection_shards' in saved).toBe(false);
  });
});

describe('channelSettingFields：新增字段保存契约', () => {
  const baseForm = {
    force_format: false,
    thinking_to_content: false,
    proxy: '',
    pass_through_body_enabled: false,
    system_prompt: '',
    system_prompt_override: false,
    responses_websocket_enabled: false,
    http_protocol: 'auto',
    http2_connection_shards: 1,
    task_plugin_key: '',
    task_extend_plugin_keys: [],
  };

  it('responses_websocket_enabled 仅在支持的渠道类型保存 true', () => {
    expect(
      JSON.parse(
        buildChannelSettingJSON({}, { ...baseForm, type: 1, responses_websocket_enabled: true }),
      ).responses_websocket_enabled,
    ).toBe(true);
    // 类型 14 (Claude) 不支持：永远为 false
    expect(
      JSON.parse(
        buildChannelSettingJSON({}, { ...baseForm, type: 14, responses_websocket_enabled: true }),
      ).responses_websocket_enabled,
    ).toBe(false);
  });

  it('http_protocol 仅在 http1 时写入；分片数仅在 >1 时写入', () => {
    const auto = JSON.parse(buildChannelSettingJSON({}, { ...baseForm, type: TYPE }));
    expect('http_protocol' in auto).toBe(false);
    expect('http2_connection_shards' in auto).toBe(false);

    const http1 = JSON.parse(
      buildChannelSettingJSON(
        {},
        { ...baseForm, type: TYPE, http_protocol: 'http1', http2_connection_shards: 4 },
      ),
    );
    expect(http1.http_protocol).toBe('http1');
    // http1 模式下分片数强制 1 且不写入
    expect('http2_connection_shards' in http1).toBe(false);

    const sharded = JSON.parse(
      buildChannelSettingJSON(
        {},
        { ...baseForm, type: TYPE, http2_connection_shards: 3 },
      ),
    );
    expect(sharded.http2_connection_shards).toBe(3);
    expect('http_protocol' in sharded).toBe(false);

    // 切回 auto 时清除历史 http_protocol
    const backToAuto = JSON.parse(
      buildChannelSettingJSON({ http_protocol: 'http1' }, { ...baseForm, type: TYPE }),
    );
    expect('http_protocol' in backToAuto).toBe(false);
  });

  it('task_plugin_key 仅类型 61 保存；task_extend_plugin_keys 仅类型 60 且非空保存', () => {
    expect(
      JSON.parse(
        buildChannelSettingJSON(
          {},
          { ...baseForm, type: CHANNEL_TYPE_TASK_PLUGIN, task_plugin_key: ' sunoapi ' },
        ),
      ).task_plugin_key,
    ).toBe('sunoapi');

    const notPlugin = JSON.parse(
      buildChannelSettingJSON({}, { ...baseForm, type: 1, task_plugin_key: 'x' }),
    );
    expect('task_plugin_key' in notPlugin).toBe(false);

    expect(
      JSON.parse(
        buildChannelSettingJSON(
          {},
          {
            ...baseForm,
            type: CHANNEL_TYPE_NEW_API,
            task_extend_plugin_keys: ['kling', 'vidu'],
          },
        ),
      ).task_extend_plugin_keys,
    ).toEqual(['kling', 'vidu']);

    const emptyExtend = JSON.parse(
      buildChannelSettingJSON(
        {},
        { ...baseForm, type: CHANNEL_TYPE_NEW_API, task_extend_plugin_keys: [] },
      ),
    );
    expect('task_extend_plugin_keys' in emptyExtend).toBe(false);
  });

  it('http2_connection_shards 规范化到 1-8', () => {
    expect(normalizeHttp2ConnectionShards(0)).toBe(1);
    expect(normalizeHttp2ConnectionShards(9)).toBe(8);
    expect(normalizeHttp2ConnectionShards('5')).toBe(5);
    expect(normalizeHttp2ConnectionShards(undefined)).toBe(1);
    expect(normalizeHttpProtocol('http1')).toBe('http1');
    expect(normalizeHttpProtocol('weird')).toBe('auto');
  });
});

describe('channelSettingFields：类型 60/61 插件字段与 58 advanced_custom', () => {
  it('类型 60 加载时把单绑定并入扩展列表去重', () => {
    const { fields } = parseChannelSettingFields(
      JSON.stringify({
        task_plugin_key: 'kling',
        task_extend_plugin_keys: ['kling', 'vidu', ''],
      }),
      CHANNEL_TYPE_NEW_API,
    );
    expect(fields.task_extend_plugin_keys).toEqual(['kling', 'vidu']);
  });

  it('advanced_custom 从 settings JSON 读取并序列化', () => {
    const settingsStr = JSON.stringify({
      vertex_key_type: 'json',
      advanced_custom: { advanced_routes: [{ incoming_path: '/v1/chat/completions' }] },
    });
    expect(parseAdvancedCustomFormValue(settingsStr)).toBe(
      JSON.stringify(
        { advanced_routes: [{ incoming_path: '/v1/chat/completions' }] },
        null,
        2,
      ),
    );
    expect(parseAdvancedCustomFormValue('{}')).toBe('');
    expect(parseAdvancedCustomFormValue('bad json')).toBe('');
  });

  it('advanced_custom 校验：空/非法/合法', () => {
    expect(validateAdvancedCustomRaw('').ok).toBe(false);
    expect(validateAdvancedCustomRaw('not json').ok).toBe(false);
    expect(validateAdvancedCustomRaw('{"a":1}').ok).toBe(false);
    expect(validateAdvancedCustomRaw('{"advanced_routes":[]}').ok).toBe(false);

    const okResult = validateAdvancedCustomRaw(
      JSON.stringify({ advanced_routes: [{ incoming_path: '/v1/messages' }] }),
    );
    expect(okResult.ok).toBe(true);
    expect(okResult.config.advanced_routes).toHaveLength(1);
  });
});

describe('渠道类型常量包含新版类型 58-63', () => {
  it('CHANNEL_OPTIONS 覆盖 58-63 且名称正确', () => {
    const byValue = Object.fromEntries(CHANNEL_OPTIONS.map((o) => [o.value, o]));
    expect(byValue[58].label).toBe('高级自定义');
    expect(byValue[59].label).toBe('Sub2API');
    expect(byValue[60].label).toBe('New API');
    expect(byValue[61].label).toBe('任务插件');
    expect(byValue[62].label).toBe('vLLM');
    expect(byValue[63].label).toBe('SGLang');
    // 每个类型都有颜色与分组标识（classic 用 Semi 颜色渲染标签）
    for (const value of [58, 59, 60, 61, 62, 63]) {
      expect(typeof byValue[value].color).toBe('string');
      expect(byValue[value].color.length).toBeGreaterThan(0);
    }
  });

  it('Responses WebSocket 支持列表包含 1/57/58/59/60', () => {
    [1, 57, 58, 59, 60].forEach((type) => {
      expect(RESPONSES_WEBSOCKET_CHANNEL_TYPES.has(type)).toBe(true);
    });
    expect(RESPONSES_WEBSOCKET_CHANNEL_TYPES.has(14)).toBe(false);
  });
});
