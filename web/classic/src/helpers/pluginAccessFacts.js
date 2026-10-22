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

// 数据源是网关自己解析出来的 meta（pkg/jsplugin.Meta：allowedHosts / baseUrl / auth.type），
// 不是前端猜的：上传与详情接口都会带这三项。auth.type 的取值集合由
// registry.go:1188 限定为 ''|none|api_key|oauth2_jwt（vertex_oauth 会被归一成 oauth2_jwt）。

const AUTH_LABELS = {
  none: '无（插件声明）',
  api_key: 'API Key',
  oauth2_jwt: 'OAuth 2.0 服务账号',
};

export function describePluginAuth(meta, t) {
  const type = meta?.auth?.type ?? '';
  if (!type) return t('未声明，上游可能仍需 API Key');
  return t(AUTH_LABELS[type] || type);
}

export function describePluginAllowedHosts(meta, t) {
  const hosts = (meta?.allowedHosts ?? []).filter(Boolean);
  return hosts.length ? hosts.join(', ') : t('未声明额外域名');
}

export function describePluginBaseUrl(meta, t) {
  return meta?.baseUrl || t('未声明');
}

// 供 Semi <Descriptions data={...}> 直接用；顺序即展示顺序。
export function getPluginAccessFacts(meta, t) {
  return [
    { key: t('额外请求域名'), value: describePluginAllowedHosts(meta, t) },
    { key: t('默认 API 地址'), value: describePluginBaseUrl(meta, t) },
    { key: t('上游鉴权'), value: describePluginAuth(meta, t) },
  ];
}
