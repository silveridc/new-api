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
import { getOAuthState } from '../helpers/api';
import { buildOAuthAuthorizationUrl } from '../helpers/oauthUrls';
import {
  buildAssertionResult,
  prepareCredentialRequestOptions,
  isPasskeySupported,
} from '../helpers/passkey';
import {
  encryptPassword,
  isPasswordEncryptionSupported,
} from '../helpers/passwordEncryption';
import { openOAuthPopup } from '../helpers/oauthPopup';

// 与后端 service/security_verification.go 的 VerificationMethod* 常量一致。
// session 不在列表里：policy 从不返回它，VerifySecurityInput 也会拒绝它。
export const VERIFICATION_METHODS = ['2fa', 'passkey', 'password', 'oauth'];

function assertProof(proof, method, operation) {
  const valid =
    proof &&
    typeof proof.proof_token === 'string' &&
    proof.proof_token.length > 0 &&
    proof.method === method &&
    proof.scope === operation.scope &&
    Number(proof.expires_at) * 1000 > Date.now();
  if (!valid) {
    throw new Error('验证凭证无效或已过期，请重新验证');
  }
  return proof;
}

function readData(response, fallback) {
  const body = response.data || {};
  if (!body.success) {
    throw new Error(body.message || fallback);
  }
  return body.data;
}

export class SecureVerificationService {
  static async checkAvailableVerificationMethods(scope = 'channel.key.read') {
    const response = await API.get('/api/verify/methods', {
      params: { scope },
    });
    const requirements = readData(response, '获取验证方式失败') || {};
    const passkeySupported = await isPasskeySupported();
    return summarizeRequirements(
      { ...requirements, scope: requirements.scope || scope },
      { passkeySupported },
    );
  }

  // OAuth 授权的 client_id / 端点只在 /api/status 里，弹窗需要它来拼授权 URL。
  static async loadOAuthStatus() {
    try {
      const response = await API.get('/api/status');
      return response.data?.data || {};
    } catch {
      return {};
    }
  }

  static async verify2FA(code, operation) {
    const response = await API.post('/api/verify', {
      method: '2fa',
      scope: operation.scope,
      context: operation.context,
      code: (code || '').trim(),
    });
    return assertProof(readData(response, '验证失败'), '2fa', operation);
  }

  static async verifyPassword(password, operation, passwordEncryptionEnabled) {
    const fields =
      passwordEncryptionEnabled === true
        ? await encryptPassword(password)
        : { password };
    const response = await API.post('/api/verify', {
      method: 'password',
      scope: operation.scope,
      context: operation.context,
      ...fields,
    });
    return assertProof(readData(response, '验证失败'), 'password', operation);
  }

  static async verifyPasskey(operation) {
    const beginResponse = await API.post('/api/user/passkey/verify/begin', {
      scope: operation.scope,
      context: operation.context,
    });
    const data = readData(beginResponse, '开始验证失败');
    const publicKey = prepareCredentialRequestOptions(data.options || data);
    const credential = await navigator.credentials.get({ publicKey });
    const assertion = buildAssertionResult(credential);
    if (!assertion) throw new Error('Passkey 验证失败');
    const finishResponse = await API.post(
      '/api/user/passkey/verify/finish',
      { flow_token: data.flow_token, credential: assertion },
      { singleUseAuthorization: true },
    );
    return assertProof(
      readData(finishResponse, '验证失败'),
      'passkey',
      operation,
    );
  }

  static async verifyOAuth(provider, operation) {
    if (!provider) throw new Error('请选择用于验证的已绑定账号');
    const exchange = await openOAuthPopup({
      provider,
      intent: 'verify',
      prepare: async () => {
        const state = await getOAuthState({
          intent: 'verify',
          provider,
          scope: operation.scope,
          context: operation.context,
        });
        if (!state) throw new Error('OAuth 授权请求失败');
        const status = await SecureVerificationService.loadOAuthStatus();
        return {
          state,
          url: buildOAuthAuthorizationUrl(provider, state, status),
        };
      },
    });
    const { callback } = exchange;
    try {
      const response = await API.get(`/api/oauth/${provider}`, {
        params: {
          state: callback.state,
          code: callback.code,
          error: callback.error,
          error_description: callback.errorDescription,
        },
        singleUseAuthorization: true,
      });
      const proof = readData(response, 'OAuth 验证失败');
      exchange.finish({ success: true });
      return assertProof(proof, 'oauth', operation);
    } catch (error) {
      exchange.finish({
        success: false,
        message: error.message || 'OAuth 验证失败',
      });
      throw error;
    }
  }

  /**
   * @param {string} method - 2fa | passkey | password | oauth
   * @param {Object} input - 该方式需要的凭据：{code} / {} / {password} / {provider}
   * @param {Object} operation - {scope, context}
   * @param {Object} [requirements] - 验证方式汇总，用于读取 passwordEncryptionEnabled
   */
  static async verify(method, input = {}, operation = {}, requirements = {}) {
    switch (method) {
      case '2fa':
        return this.verify2FA(input.code, operation);
      case 'passkey':
        return this.verifyPasskey(operation);
      case 'password':
        return this.verifyPassword(
          input.password,
          operation,
          requirements.passwordEncryptionEnabled,
        );
      case 'oauth':
        return this.verifyOAuth(input.provider, operation);
      default:
        throw new Error(`不支持的验证方式：${method}`);
    }
  }
}

/**
 * 把 /api/verify/methods 的响应整理成 UI 可直接消费的结构。
 * 设备能力与站点配置只会让某个方式「不可用」并带上原因，不会把它从列表里
 * 删掉，用户才知道下一步该去做什么。
 */
export function summarizeRequirements(
  requirements,
  { passkeySupported = false } = {},
) {
  const oauthProviders = requirements.oauth_providers || [];
  const encryptionUsable =
    requirements.password_encryption_enabled !== true ||
    isPasswordEncryptionSupported();

  const methods = (requirements.methods || []).map((option) => {
    if (!option.available) return option;
    if (option.method === 'passkey' && !passkeySupported) {
      return {
        ...option,
        available: false,
        reason: '当前设备不支持 Passkey 验证。',
      };
    }
    if (option.method === 'password' && !encryptionUsable) {
      return {
        ...option,
        available: false,
        reason: '当前站点未启用安全连接，无法加密并校验密码。',
      };
    }
    if (option.method === 'oauth' && oauthProviders.length === 0) {
      return {
        ...option,
        available: false,
        reason: '还没有可用于验证的已绑定账号。',
      };
    }
    return option;
  });

  const isAvailable = (method) =>
    methods.some((option) => option.method === method && option.available);

  return {
    scope: requirements.scope,
    methods,
    oauthProviders,
    passwordEncryptionEnabled:
      requirements.password_encryption_enabled === true,
    has2FA: isAvailable('2fa'),
    hasPasskey: isAvailable('passkey'),
    hasPassword: isAvailable('password'),
    hasOAuth: isAvailable('oauth'),
    passkeySupported,
    availableMethods: methods
      .filter((option) => option.available)
      .map((option) => option.method),
  };
}

// 默认方式沿用 classic 原有偏好：Passkey 优先，其次两步验证，再退到密码与已绑定账号。
export function pickDefaultVerificationMethod(requirements, preferred) {
  const usable = (method) =>
    Boolean(method) && (requirements.availableMethods || []).includes(method);
  if (usable(preferred)) return preferred;
  const candidates = ['passkey', '2fa', 'password', 'oauth'];
  return candidates.find((method) => usable(method)) || null;
}

export const createApiCalls = {
  viewChannelKey: (channelId) => async (proofToken) => {
    const response = await API.post(
      `/api/channel/${channelId}/key`,
      {},
      {
        headers: { 'X-Security-Proof': proofToken },
        singleUseAuthorization: true,
      },
    );
    return response.data;
  },
  custom:
    (url, method = 'POST', extraData = {}) =>
    async (proofToken) => {
      const config = {
        headers: { 'X-Security-Proof': proofToken },
        singleUseAuthorization: true,
      };
      let response;
      switch (method.toUpperCase()) {
        case 'GET':
          response = await API.get(url, { ...config, params: extraData });
          break;
        case 'POST':
          response = await API.post(url, extraData, config);
          break;
        case 'PUT':
          response = await API.put(url, extraData, config);
          break;
        case 'PATCH':
          response = await API.patch(url, extraData, config);
          break;
        case 'DELETE':
          response = await API.delete(url, { ...config, data: extraData });
          break;
        default:
          throw new Error(`不支持的HTTP方法: ${method}`);
      }
      return response.data;
    },
};
