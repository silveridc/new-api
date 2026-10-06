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
import {
  buildAssertionResult,
  prepareCredentialRequestOptions,
  isPasskeySupported,
} from '../helpers/passkey';

export class SecureVerificationService {
  static async checkAvailableVerificationMethods(scope = 'channel.key.read') {
    const [requirements, passkeySupported] = await Promise.all([
      API.get('/api/verify/methods', { params: { scope } }),
      isPasskeySupported(),
    ]);
    const methods = requirements.data?.data?.methods || [];
    return {
      has2FA: methods.some((item) => item.method === '2fa' && item.available),
      hasPasskey: methods.some(
        (item) => item.method === 'passkey' && item.available,
      ),
      passkeySupported,
      methods,
    };
  }

  static async verify2FA(code, operation) {
    const response = await API.post('/api/verify', {
      method: '2fa',
      scope: operation.scope,
      context: operation.context,
      code: code.trim(),
    });
    if (!response.data?.success || !response.data?.data?.proof_token) {
      throw new Error(response.data?.message || '验证失败');
    }
    return response.data.data;
  }

  static async verifyPasskey(operation) {
    const beginResponse = await API.post('/api/user/passkey/verify/begin', {
      scope: operation.scope,
      context: operation.context,
    });
    if (!beginResponse.data?.success) {
      throw new Error(beginResponse.data?.message || '开始验证失败');
    }
    const data = beginResponse.data.data;
    const publicKey = prepareCredentialRequestOptions(data.options || data);
    const credential = await navigator.credentials.get({ publicKey });
    const assertion = buildAssertionResult(credential);
    if (!assertion) throw new Error('Passkey 验证失败');
    const finishResponse = await API.post(
      '/api/user/passkey/verify/finish',
      { flow_token: data.flow_token, credential: assertion },
      { singleUseAuthorization: true },
    );
    if (!finishResponse.data?.success || !finishResponse.data?.data?.proof_token) {
      throw new Error(finishResponse.data?.message || '验证失败');
    }
    return finishResponse.data.data;
  }

  static async verify(method, code, operation) {
    if (method === '2fa') return this.verify2FA(code, operation);
    if (method === 'passkey') return this.verifyPasskey(operation);
    throw new Error('不支持的验证方式');
  }
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
  custom: (url, method = 'POST', extraData = {}) => async (proofToken) => {
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
      case 'DELETE':
        response = await API.delete(url, { ...config, data: extraData });
        break;
      default:
        throw new Error(`不支持的HTTP方法: ${method}`);
    }
    return response.data;
  },
};
