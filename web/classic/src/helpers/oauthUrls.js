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
 * 按 provider 构造授权 URL（弹窗与整页跳转共用同一份参数）。
 * state 必须是 /api/oauth/state 返回的流程令牌，redirect_uri 固定回到
 * /oauth/<provider> 回调页，与系统设置里登记的回调地址一致。
 */
export function buildOAuthAuthorizationUrl(provider, state, status = {}) {
  const origin = window.location.origin;
  const params = new URLSearchParams();
  switch (provider) {
    case 'github': {
      if (!status.github_client_id) break;
      params.set('client_id', status.github_client_id);
      params.set('state', state);
      params.set('scope', 'user:email');
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }
    case 'discord': {
      if (!status.discord_client_id) break;
      params.set('client_id', status.discord_client_id);
      params.set('redirect_uri', `${origin}/oauth/discord`);
      params.set('response_type', 'code');
      params.set('scope', 'identify+openid');
      params.set('state', state);
      return `https://discord.com/oauth2/authorize?${params.toString()}`;
    }
    case 'oidc': {
      if (!status.oidc_authorization_endpoint || !status.oidc_client_id) break;
      const url = new URL(status.oidc_authorization_endpoint);
      url.searchParams.set('client_id', status.oidc_client_id);
      url.searchParams.set('redirect_uri', `${origin}/oauth/oidc`);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid profile email');
      url.searchParams.set('state', state);
      return url.toString();
    }
    case 'linuxdo': {
      if (!status.linuxdo_client_id) break;
      params.set('response_type', 'code');
      params.set('client_id', status.linuxdo_client_id);
      params.set('state', state);
      return `https://connect.linux.do/oauth2/authorize?${params.toString()}`;
    }
    default: {
      const configured = (status.custom_oauth_providers || []).find(
        (item) => item?.slug === provider,
      );
      if (!configured?.authorization_endpoint || !configured?.client_id) break;
      const url = new URL(configured.authorization_endpoint);
      url.searchParams.set('client_id', configured.client_id);
      url.searchParams.set('redirect_uri', `${origin}/oauth/${provider}`);
      url.searchParams.set('response_type', 'code');
      if (configured.scopes) {
        url.searchParams.set('scope', configured.scopes);
      }
      url.searchParams.set('state', state);
      return url.toString();
    }
  }
  throw new Error('该 OAuth 账号不可用，请检查系统设置中的 OAuth 配置。');
}
