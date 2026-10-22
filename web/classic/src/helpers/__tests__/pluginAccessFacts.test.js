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
  describePluginAllowedHosts,
  describePluginAuth,
  describePluginBaseUrl,
  getPluginAccessFacts,
} from '../pluginAccessFacts';

// classic 用中文原文作 key，t 直接回显就能断言文案
const t = (key) => key;

describe('describePluginAllowedHosts', () => {
  it('joins the declared hosts verbatim', () => {
    expect(
      describePluginAllowedHosts(
        { allowedHosts: ['a.example', 'b.example:8443'] },
        t,
      ),
    ).toBe('a.example, b.example:8443');
  });

  it('says "not declared" for the empty array the backend always serializes', () => {
    // pkg/jsplugin.Meta.AllowedHosts 没有 omitempty：未声明与声明为空都是 []
    expect(describePluginAllowedHosts({ allowedHosts: [] }, t)).toBe(
      '未声明额外域名',
    );
    expect(describePluginAllowedHosts({}, t)).toBe('未声明额外域名');
    expect(describePluginAllowedHosts(undefined, t)).toBe('未声明额外域名');
  });

  it('drops blank entries instead of rendering an empty host list', () => {
    expect(
      describePluginAllowedHosts({ allowedHosts: ['', 'a.example'] }, t),
    ).toBe('a.example');
    expect(describePluginAllowedHosts({ allowedHosts: [''] }, t)).toBe(
      '未声明额外域名',
    );
  });
});

describe('describePluginBaseUrl', () => {
  it('shows the declared default address', () => {
    expect(
      describePluginBaseUrl({ baseUrl: 'https://api.example.com' }, t),
    ).toBe('https://api.example.com');
  });

  it('falls back when the field is absent or empty', () => {
    expect(describePluginBaseUrl({ baseUrl: '' }, t)).toBe('未声明');
    expect(describePluginBaseUrl({}, t)).toBe('未声明');
  });
});

describe('describePluginAuth', () => {
  it('maps the four auth types the gateway accepts', () => {
    // registry.go:1188 只允许 ''|none|api_key|oauth2_jwt，vertex_oauth 会被归一
    expect(describePluginAuth({ auth: { type: 'api_key' } }, t)).toBe(
      'API Key',
    );
    expect(describePluginAuth({ auth: { type: 'none' } }, t)).toBe(
      '无（插件声明）',
    );
    expect(describePluginAuth({ auth: { type: 'oauth2_jwt' } }, t)).toBe(
      'OAuth 2.0 服务账号',
    );
  });

  it('warns that an undeclared auth may still need a key', () => {
    expect(describePluginAuth({ auth: { type: '' } }, t)).toBe(
      '未声明，上游可能仍需 API Key',
    );
    expect(describePluginAuth({}, t)).toBe('未声明，上游可能仍需 API Key');
  });

  it('passes an unknown future type through instead of hiding it', () => {
    expect(describePluginAuth({ auth: { type: 'bearer' } }, t)).toBe('bearer');
  });
});

describe('getPluginAccessFacts', () => {
  it('returns the three facts in display order for Semi Descriptions', () => {
    expect(
      getPluginAccessFacts(
        { allowedHosts: ['a.example'], baseUrl: '', auth: { type: 'api_key' } },
        t,
      ),
    ).toEqual([
      { key: '额外请求域名', value: 'a.example' },
      { key: '默认 API 地址', value: '未声明' },
      { key: '上游鉴权', value: 'API Key' },
    ]);
  });
});
