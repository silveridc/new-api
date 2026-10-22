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

import { buildOAuthAuthorizationUrl } from '../oauthUrls';

const ORIGIN = window.location.origin;

const STATUS = {
  github_client_id: 'gh-id',
  discord_client_id: 'dc-id',
  oidc_client_id: 'oidc-id',
  oidc_authorization_endpoint: 'https://idp.example/authorize?tenant=1',
  linuxdo_client_id: 'ld-id',
  custom_oauth_providers: [
    {
      slug: 'docks',
      client_id: 'docks-id',
      authorization_endpoint: 'https://docks.example/oauth/authorize',
      scopes: 'openid email',
    },
    {
      slug: 'bare',
      client_id: 'bare-id',
      authorization_endpoint: 'https://bare.example/authorize',
      scopes: '',
    },
  ],
};

function paramsOf(url) {
  return new URL(url).searchParams;
}

describe('buildOAuthAuthorizationUrl', () => {
  it('builds the built-in provider URLs used by the login buttons', () => {
    expect(buildOAuthAuthorizationUrl('github', 'st ate', STATUS)).toBe(
      `https://github.com/login/oauth/authorize?client_id=gh-id&state=st+ate&scope=user%3Aemail`,
    );
    const discord = paramsOf(
      buildOAuthAuthorizationUrl('discord', 'state', STATUS),
    );
    expect(discord.get('redirect_uri')).toBe(`${ORIGIN}/oauth/discord`);
    expect(discord.get('scope')).toBe('identify+openid');
    const linuxdo = paramsOf(
      buildOAuthAuthorizationUrl('linuxdo', 'state', STATUS),
    );
    expect(linuxdo.get('client_id')).toBe('ld-id');
  });

  it('keeps pre-existing query params on the OIDC endpoint', () => {
    const url = buildOAuthAuthorizationUrl('oidc', 'state', STATUS);
    expect(url).toContain('tenant=1');
    expect(paramsOf(url).get('redirect_uri')).toBe(`${ORIGIN}/oauth/oidc`);
    expect(paramsOf(url).get('scope')).toBe('openid profile email');
  });

  it('uses the custom provider config and only sets scope when configured', () => {
    const docks = paramsOf(
      buildOAuthAuthorizationUrl('docks', 'state', STATUS),
    );
    expect(docks.get('scope')).toBe('openid email');
    expect(docks.get('redirect_uri')).toBe(`${ORIGIN}/oauth/docks`);
    const bare = paramsOf(buildOAuthAuthorizationUrl('bare', 'state', STATUS));
    expect(bare.has('scope')).toBe(false);
  });

  it('rejects unknown providers and half-configured ones', () => {
    expect(() =>
      buildOAuthAuthorizationUrl('telegram', 'state', STATUS),
    ).toThrow('该 OAuth 账号不可用，请检查系统设置中的 OAuth 配置。');
    expect(() =>
      buildOAuthAuthorizationUrl('github', 'state', {
        ...STATUS,
        github_client_id: '',
      }),
    ).toThrow('该 OAuth 账号不可用');
    expect(() => buildOAuthAuthorizationUrl('oidc', 'state', {})).toThrow(
      '该 OAuth 账号不可用',
    );
  });
});
