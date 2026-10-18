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

const { API } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));
vi.mock('../../helpers/passkey', () => ({
  buildAssertionResult: vi.fn(),
  prepareCredentialRequestOptions: vi.fn(),
  isPasskeySupported: vi.fn(async () => false),
}));

import { createApiCalls } from '../secureVerification';

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
