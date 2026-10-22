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

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  API,
  getOAuthState,
  buildOAuthAuthorizationUrl,
  encryptPassword,
  isPasswordEncryptionSupported,
  isPasskeySupported,
  prepareCredentialRequestOptions,
  buildAssertionResult,
  openOAuthPopup,
} = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getOAuthState: vi.fn(),
  buildOAuthAuthorizationUrl: vi.fn(),
  encryptPassword: vi.fn(),
  isPasswordEncryptionSupported: vi.fn(() => true),
  isPasskeySupported: vi.fn(async () => false),
  prepareCredentialRequestOptions: vi.fn(),
  buildAssertionResult: vi.fn(),
  openOAuthPopup: vi.fn(),
}));

vi.mock('../../helpers', () => ({ API }));
vi.mock('../../helpers/passkey', () => ({
  buildAssertionResult,
  prepareCredentialRequestOptions,
  isPasskeySupported,
}));
vi.mock('../../helpers/api', () => ({ getOAuthState }));
vi.mock('../../helpers/oauthUrls', () => ({ buildOAuthAuthorizationUrl }));
vi.mock('../../helpers/passwordEncryption', () => ({
  encryptPassword,
  isPasswordEncryptionSupported,
}));
vi.mock('../../helpers/oauthPopup', () => ({ openOAuthPopup }));

import {
  createApiCalls,
  summarizeRequirements,
  pickDefaultVerificationMethod,
  SecureVerificationService,
  VERIFICATION_METHODS,
} from '../secureVerification';

// 契约样例来自后端 router/api-router.go 的 access_tokens 组（GET/POST/PATCH/
// DELETE）与 components/settings/personal/cards/AccessTokensCard.jsx 的调用。
const PROOF_CONFIG = {
  headers: { 'X-Security-Proof': 'proof-1' },
  singleUseAuthorization: true,
};

describe('createApiCalls.custom', () => {
  beforeEach(() => {
    API.get.mockResolvedValue({ data: { ok: 'get' } });
    API.post.mockResolvedValue({ data: { ok: 'post' } });
    API.put.mockResolvedValue({ data: { ok: 'put' } });
    API.patch.mockResolvedValue({ data: { ok: 'patch' } });
    API.delete.mockResolvedValue({ data: { ok: 'delete' } });
  });

  it('sends PATCH with the proof header and returns the body', async () => {
    const call = createApiCalls.custom('/api/user/access_tokens/7', 'PATCH', {
      name: 'ci',
    });
    await expect(call('proof-1')).resolves.toEqual({ ok: 'patch' });
    expect(API.patch).toHaveBeenCalledWith(
      '/api/user/access_tokens/7',
      { name: 'ci' },
      PROOF_CONFIG,
    );
  });

  it('accepts a lowercase method', async () => {
    await createApiCalls.custom('/api/x', 'patch', { a: 1 })('proof-1');
    expect(API.patch).toHaveBeenCalledWith('/api/x', { a: 1 }, PROOF_CONFIG);
  });

  it('defaults to POST', async () => {
    await createApiCalls.custom('/api/x')('proof-1');
    expect(API.post).toHaveBeenCalledWith('/api/x', {}, PROOF_CONFIG);
  });

  it('maps GET to params and DELETE to data', async () => {
    await createApiCalls.custom('/api/x', 'GET', { p: 1 })('proof-1');
    expect(API.get).toHaveBeenCalledWith('/api/x', {
      ...PROOF_CONFIG,
      params: { p: 1 },
    });

    await createApiCalls.custom('/api/x/1', 'DELETE')('proof-1');
    expect(API.delete).toHaveBeenCalledWith('/api/x/1', {
      ...PROOF_CONFIG,
      data: {},
    });
  });

  it('still rejects a method the dispatcher does not support', async () => {
    await expect(
      createApiCalls.custom('/api/x', 'HEAD')('proof-1'),
    ).rejects.toThrow('不支持的HTTP方法: HEAD');
  });

  it('sends PUT and DELETE through their own verbs', async () => {
    await createApiCalls.custom('/api/x/1', 'PUT', { b: 2 })('proof-1');
    expect(API.put).toHaveBeenCalledWith('/api/x/1', { b: 2 }, PROOF_CONFIG);
    expect(API.patch).not.toHaveBeenCalled();
  });
});

describe('createApiCalls.viewChannelKey', () => {
  it('posts to the channel key endpoint with a single-use proof', async () => {
    API.post.mockResolvedValue({ data: { success: true } });
    await expect(createApiCalls.viewChannelKey(12)('proof-1')).resolves.toEqual(
      { success: true },
    );
    expect(API.post).toHaveBeenCalledWith(
      '/api/channel/12/key',
      {},
      PROOF_CONFIG,
    );
  });
});

// 契约样例来自后端 controller/secure_verification.go（GetVerificationMethods /
// VerifySecurity）与 service/security_verification.go 的 VerificationMethod* 常量。
const okBody = (data) => ({ data: { success: true, data } });
const failBody = (message) => ({ data: { success: false, message } });

const proof = (overrides = {}) => ({
  proof_token: 'proof-1',
  method: '2fa',
  scope: 'channel.key.read',
  expires_at: Math.floor(Date.now() / 1000) + 300,
  ...overrides,
});

const OPERATION = { scope: 'channel.key.read', context: { channel_id: 12 } };

describe('VERIFICATION_METHODS', () => {
  it('matches the methods the backend can issue proofs for', () => {
    // session 不在列表里：policy 从不返回它，VerifySecurityInput 会拒绝它。
    expect(VERIFICATION_METHODS).toEqual([
      '2fa',
      'passkey',
      'password',
      'oauth',
    ]);
  });
});

describe('summarizeRequirements', () => {
  const requirements = () => ({
    scope: 'channel.key.read',
    password_encryption_enabled: true,
    methods: [
      { method: '2fa', available: true },
      { method: 'passkey', available: true },
      { method: 'password', available: true },
      { method: 'oauth', available: true },
    ],
    oauth_providers: [{ slug: 'github', name: 'GitHub' }],
  });

  it('keeps every available method when the device and site allow it', () => {
    const summary = summarizeRequirements(requirements(), {
      passkeySupported: true,
    });
    expect(summary.availableMethods).toEqual([
      '2fa',
      'passkey',
      'password',
      'oauth',
    ]);
    expect(summary.passwordEncryptionEnabled).toBe(true);
    expect(summary.hasOAuth).toBe(true);
    expect(summary.scope).toBe('channel.key.read');
  });

  it('marks passkey unavailable instead of hiding it', () => {
    const summary = summarizeRequirements(requirements(), {
      passkeySupported: false,
    });
    expect(summary.availableMethods).toEqual(['2fa', 'password', 'oauth']);
    expect(summary.hasPasskey).toBe(false);
    expect(
      summary.methods.find((item) => item.method === 'passkey').reason,
    ).toBe('当前设备不支持 Passkey 验证。');
  });

  it('marks password unavailable when the browser cannot encrypt', () => {
    isPasswordEncryptionSupported.mockReturnValueOnce(false);
    const summary = summarizeRequirements(requirements(), {
      passkeySupported: true,
    });
    expect(summary.availableMethods).toEqual(['2fa', 'passkey', 'oauth']);
    expect(
      summary.methods.find((item) => item.method === 'password').reason,
    ).toBe('当前站点未启用安全连接，无法加密并校验密码。');
  });

  it('marks oauth unavailable without a bound provider', () => {
    const source = requirements();
    source.oauth_providers = [];
    const summary = summarizeRequirements(source, { passkeySupported: true });
    expect(summary.hasOAuth).toBe(false);
    expect(summary.availableMethods).toEqual(['2fa', 'passkey', 'password']);
  });

  it('leaves backend-side unavailability untouched', () => {
    const source = requirements();
    source.methods = [{ method: '2fa', available: false, reason: '未开启' }];
    const summary = summarizeRequirements(source, { passkeySupported: true });
    expect(summary.methods).toEqual([
      { method: '2fa', available: false, reason: '未开启' },
    ]);
    expect(summary.availableMethods).toEqual([]);
  });
});

describe('pickDefaultVerificationMethod', () => {
  const source = () => ({
    methods: [
      { method: '2fa', available: true },
      { method: 'passkey', available: true },
      { method: 'password', available: true },
    ],
  });
  const summary = summarizeRequirements(source(), { passkeySupported: true });

  it('prefers passkey and falls back to 2fa without device support', () => {
    expect(pickDefaultVerificationMethod(summary)).toBe('passkey');
    expect(
      pickDefaultVerificationMethod(
        summarizeRequirements(source(), { passkeySupported: false }),
      ),
    ).toBe('2fa');
  });

  it('honours a preferred method only when it is available', () => {
    expect(pickDefaultVerificationMethod(summary, 'password')).toBe('password');
    expect(pickDefaultVerificationMethod(summary, 'oauth')).toBe('passkey');
    expect(pickDefaultVerificationMethod(summary, null)).toBe('passkey');
  });

  it('returns null when nothing is usable', () => {
    expect(
      pickDefaultVerificationMethod({ availableMethods: [] }, '2fa'),
    ).toBeNull();
  });
});

describe('SecureVerificationService.checkAvailableVerificationMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPasswordEncryptionSupported.mockReturnValue(true);
    isPasskeySupported.mockResolvedValue(false);
  });

  it('requests the scope and folds device support into the summary', async () => {
    API.get.mockResolvedValue(
      okBody({
        scope: 'subscription.reset',
        methods: [
          { method: '2fa', available: true },
          { method: 'passkey', available: true },
        ],
      }),
    );
    const summary =
      await SecureVerificationService.checkAvailableVerificationMethods(
        'subscription.reset',
      );
    expect(API.get).toHaveBeenCalledWith('/api/verify/methods', {
      params: { scope: 'subscription.reset' },
    });
    expect(summary.scope).toBe('subscription.reset');
    expect(summary.availableMethods).toEqual(['2fa']);
    expect(summary.passkeySupported).toBe(false);
  });

  it('falls back to the requested scope when the backend omits it', async () => {
    API.get.mockResolvedValue(okBody({ methods: [] }));
    const summary =
      await SecureVerificationService.checkAvailableVerificationMethods();
    expect(summary.scope).toBe('channel.key.read');
  });

  it('surfaces the backend message on failure', async () => {
    API.get.mockResolvedValue(failBody('无权访问'));
    await expect(
      SecureVerificationService.checkAvailableVerificationMethods('x'),
    ).rejects.toThrow('无权访问');
  });
});

describe('SecureVerificationService.verify2FA', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts the trimmed code and returns the proof', async () => {
    API.post.mockResolvedValue(okBody(proof()));
    await expect(
      SecureVerificationService.verify('2fa', { code: ' 123456 ' }, OPERATION),
    ).resolves.toMatchObject({ proof_token: 'proof-1', method: '2fa' });
    expect(API.post).toHaveBeenCalledWith('/api/verify', {
      method: '2fa',
      scope: OPERATION.scope,
      context: OPERATION.context,
      code: '123456',
    });
  });

  it('rejects a proof issued for another method', async () => {
    API.post.mockResolvedValue(okBody(proof({ method: 'passkey' })));
    await expect(
      SecureVerificationService.verify2FA('123456', OPERATION),
    ).rejects.toThrow('验证凭证无效或已过期，请重新验证');
  });

  it('rejects an expired or wrong-scope proof', async () => {
    API.post.mockResolvedValue(
      okBody(proof({ expires_at: Math.floor(Date.now() / 1000) - 1 })),
    );
    await expect(
      SecureVerificationService.verify2FA('123456', OPERATION),
    ).rejects.toThrow('验证凭证无效或已过期');

    API.post.mockResolvedValue(okBody(proof({ scope: 'other.scope' })));
    await expect(
      SecureVerificationService.verify2FA('123456', OPERATION),
    ).rejects.toThrow('验证凭证无效或已过期');
  });
});

describe('SecureVerificationService.verifyPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptPassword.mockResolvedValue({
      password_encrypted: 'encrypted',
      encryption_key_id: 'kid-1',
    });
  });

  it('encrypts the password when the site requires it', async () => {
    API.post.mockResolvedValue(okBody(proof({ method: 'password' })));
    await SecureVerificationService.verify(
      'password',
      { password: 'pw' },
      OPERATION,
      {
        passwordEncryptionEnabled: true,
      },
    );
    expect(encryptPassword).toHaveBeenCalledWith('pw');
    expect(API.post).toHaveBeenCalledWith('/api/verify', {
      method: 'password',
      scope: OPERATION.scope,
      context: OPERATION.context,
      password_encrypted: 'encrypted',
      encryption_key_id: 'kid-1',
    });
  });

  it('sends the plaintext field only when encryption is off', async () => {
    API.post.mockResolvedValue(okBody(proof({ method: 'password' })));
    await SecureVerificationService.verifyPassword('pw', OPERATION, false);
    expect(encryptPassword).not.toHaveBeenCalled();
    expect(API.post).toHaveBeenCalledWith('/api/verify', {
      method: 'password',
      scope: OPERATION.scope,
      context: OPERATION.context,
      password: 'pw',
    });
  });

  it('propagates an encryption failure without calling verify', async () => {
    encryptPassword.mockRejectedValue(
      new Error('当前浏览器或站点环境不支持密码加密，请改用其他验证方式'),
    );
    await expect(
      SecureVerificationService.verifyPassword('pw', OPERATION, true),
    ).rejects.toThrow('不支持密码加密');
    expect(API.post).not.toHaveBeenCalled();
  });
});

describe('SecureVerificationService.verifyPasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareCredentialRequestOptions.mockReturnValue({ challenge: 'c' });
    buildAssertionResult.mockReturnValue({ id: 'cred-1' });
    Object.defineProperty(navigator, 'credentials', {
      value: { get: vi.fn(async () => ({ raw: 1 })) },
      configurable: true,
    });
  });

  it('runs begin / WebAuthn / finish and consumes the flow token once', async () => {
    API.post
      .mockResolvedValueOnce(
        okBody({ flow_token: 'flow-1', options: { challenge: 'abc' } }),
      )
      .mockResolvedValueOnce(okBody(proof({ method: 'passkey' })));
    const result = await SecureVerificationService.verify(
      'passkey',
      {},
      OPERATION,
    );
    expect(result.method).toBe('passkey');
    expect(API.post).toHaveBeenNthCalledWith(
      1,
      '/api/user/passkey/verify/begin',
      {
        scope: OPERATION.scope,
        context: OPERATION.context,
      },
    );
    expect(prepareCredentialRequestOptions).toHaveBeenCalledWith({
      challenge: 'abc',
    });
    expect(navigator.credentials.get).toHaveBeenCalledWith({
      publicKey: { challenge: 'c' },
    });
    expect(API.post).toHaveBeenNthCalledWith(
      2,
      '/api/user/passkey/verify/finish',
      { flow_token: 'flow-1', credential: { id: 'cred-1' } },
      { singleUseAuthorization: true },
    );
  });

  it('fails before finish when the assertion cannot be built', async () => {
    buildAssertionResult.mockReturnValue(null);
    API.post.mockResolvedValueOnce(
      okBody({ flow_token: 'flow-1', options: { challenge: 'abc' } }),
    );
    await expect(
      SecureVerificationService.verifyPasskey(OPERATION),
    ).rejects.toThrow('Passkey 验证失败');
    expect(API.post).toHaveBeenCalledTimes(1);
  });
});

describe('SecureVerificationService.verifyOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOAuthState.mockResolvedValue('flow-1');
    buildOAuthAuthorizationUrl.mockReturnValue('https://idp/authorize');
    isPasswordEncryptionSupported.mockReturnValue(true);
  });

  const statusBody = { github_client_id: 'gh-id' };

  it('requires a provider choice', async () => {
    await expect(
      SecureVerificationService.verify('oauth', {}, OPERATION),
    ).rejects.toThrow('请选择用于验证的已绑定账号');
  });

  it('opens the popup, exchanges the code and closes with success', async () => {
    const finish = vi.fn();
    let prepared;
    openOAuthPopup.mockImplementation(async (options) => {
      prepared = options;
      return { callback: { state: 'flow-1', code: 'code-1' }, finish };
    });
    API.get.mockImplementation(async (url) =>
      url === '/api/status'
        ? okBody(statusBody)
        : okBody(proof({ method: 'oauth' })),
    );

    const result = await SecureVerificationService.verify(
      'oauth',
      { provider: 'github' },
      OPERATION,
    );
    expect(result.method).toBe('oauth');
    expect(prepared.intent).toBe('verify');
    expect(prepared.provider).toBe('github');

    const preparedResult = await prepared.prepare();
    expect(getOAuthState).toHaveBeenCalledWith({
      intent: 'verify',
      provider: 'github',
      scope: OPERATION.scope,
      context: OPERATION.context,
    });
    expect(buildOAuthAuthorizationUrl).toHaveBeenCalledWith(
      'github',
      'flow-1',
      statusBody,
    );
    expect(preparedResult).toEqual({
      state: 'flow-1',
      url: 'https://idp/authorize',
    });

    expect(API.get).toHaveBeenCalledWith('/api/oauth/github', {
      params: {
        state: 'flow-1',
        code: 'code-1',
        error: undefined,
        error_description: undefined,
      },
      singleUseAuthorization: true,
    });
    expect(finish).toHaveBeenCalledWith({ success: true });
  });

  it('closes the popup with the failure message when the exchange fails', async () => {
    const finish = vi.fn();
    openOAuthPopup.mockResolvedValue({
      callback: { state: 'flow-1', code: 'code-1' },
      finish,
    });
    API.get.mockResolvedValue(failBody('该 OAuth 授权已失效'));
    await expect(
      SecureVerificationService.verifyOAuth('github', OPERATION),
    ).rejects.toThrow('该 OAuth 授权已失效');
    expect(finish).toHaveBeenCalledWith({
      success: false,
      message: '该 OAuth 授权已失效',
    });
  });

  it('does not exchange when the popup itself fails', async () => {
    openOAuthPopup.mockRejectedValue(
      new Error('授权弹窗被浏览器拦截，请允许弹窗后重试'),
    );
    await expect(
      SecureVerificationService.verifyOAuth('github', OPERATION),
    ).rejects.toThrow('授权弹窗被浏览器拦截');
    expect(API.get).not.toHaveBeenCalled();
  });
});

describe('SecureVerificationService.verify dispatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a method the service does not implement', async () => {
    await expect(
      SecureVerificationService.verify('session', {}, OPERATION),
    ).rejects.toThrow('不支持的验证方式：session');
    expect(API.post).not.toHaveBeenCalled();
  });
});
