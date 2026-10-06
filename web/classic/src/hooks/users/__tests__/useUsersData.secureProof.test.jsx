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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderHookCompat as renderHook,
  actAsync as act,
  cleanupHookCompat,
} from '../../channels/__tests__/renderHookCompat';

const { API, showError, showSuccess, requestVerification } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  showError: vi.fn(),
  showSuccess: vi.fn(),
  requestVerification: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s) => s }),
}));

vi.mock('../../../helpers', () => ({
  API,
  showError,
  showSuccess,
  requestVerification,
}));

vi.mock('../../../constants', () => ({
  ITEMS_PER_PAGE: 10,
}));

vi.mock('../../common/useTableCompactMode', () => ({
  useTableCompactMode: () => [false, vi.fn()],
}));

import { useUsersData } from '../useUsersData';

const resp = (data) => Promise.resolve({ data: { success: true, data } });
const proofOf = (token) => ({ proof_token: token });

const proofConfig = (call) => call[2];

describe('useUsersData 敏感操作 proof 契约', () => {
  beforeEach(() => {
    API.get.mockImplementation((url) => {
      if (String(url).startsWith('/api/user/?')) {
        return resp({ items: [], page: 1, total: 0 });
      }
      if (String(url).startsWith('/api/group/')) {
        return resp(['default']);
      }
      return resp(null);
    });
  });

  afterEach(() => {
    cleanupHookCompat();
  });

  const setup = async () => {
    const rendered = renderHook(() => useUsersData());
    await act(async () => {});
    API.get.mockClear();
    return rendered;
  };

  it('删除（硬删除）：先取 admin.user.delete proof，再带 X-Security-Proof 头发请求', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(proofOf('proof-delete-1'));
    API.post.mockResolvedValueOnce(resp({ status: 2 }));

    let ok;
    await act(async () => {
      ok = await rendered.result.current.manageUser(5, 'delete', {
        id: 5,
        username: 'bob',
      });
    });

    expect(requestVerification).toHaveBeenCalledTimes(1);
    expect(requestVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin.user.delete',
        context: { user_id: 5 },
      }),
    );
    expect(API.post).toHaveBeenCalledTimes(1);
    expect(API.post).toHaveBeenCalledWith(
      '/api/user/manage',
      { id: 5, action: 'delete' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Security-Proof': 'proof-delete-1' }),
        singleUseAuthorization: true,
      }),
    );
    expect(ok).toBe(true);
    expect(showError).not.toHaveBeenCalled();
  });

  it('禁用/启用等管理动作：scope admin.user.manage，context 带 user_id 与 action', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(proofOf('proof-manage-1'));
    API.post.mockResolvedValueOnce(resp({ status: 2, role: 1 }));

    await act(async () => {
      await rendered.result.current.manageUser(7, 'disable', { id: 7 });
    });

    expect(requestVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin.user.manage',
        context: { user_id: 7, action: 'disable' },
      }),
    );
    expect(API.post).toHaveBeenCalledWith(
      '/api/user/manage',
      { id: 7, action: 'disable' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Security-Proof': 'proof-manage-1' }),
        singleUseAuthorization: true,
      }),
    );
  });

  it('提升用户同样走 admin.user.manage，context.action = promote', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(proofOf('proof-promote-1'));
    API.post.mockResolvedValueOnce(resp({ status: 1, role: 10 }));

    await act(async () => {
      await rendered.result.current.manageUser(3, 'promote', { id: 3 });
    });

    expect(requestVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin.user.manage',
        context: { user_id: 3, action: 'promote' },
      }),
    );
  });

  it('用户取消验证：不发请求、不弹错误、loading 复位', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(null);

    let ok;
    await act(async () => {
      ok = await rendered.result.current.manageUser(9, 'enable', { id: 9 });
    });

    expect(ok).toBe(false);
    expect(API.post).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
    expect(rendered.result.current.loading).toBe(false);
  });

  it('proof 一次性：连续两次操作各自重新请求验证，不复用 token', async () => {
    const rendered = await setup();
    requestVerification
      .mockResolvedValueOnce(proofOf('p1'))
      .mockResolvedValueOnce(proofOf('p2'));
    API.post.mockResolvedValue(resp({ status: 1, role: 1 }));

    await act(async () => {
      await rendered.result.current.manageUser(1, 'disable', { id: 1 });
    });
    await act(async () => {
      await rendered.result.current.manageUser(2, 'disable', { id: 2 });
    });

    expect(requestVerification).toHaveBeenCalledTimes(2);
    expect(proofConfig(API.post.mock.calls[0]).headers['X-Security-Proof']).toBe('p1');
    expect(proofConfig(API.post.mock.calls[1]).headers['X-Security-Proof']).toBe('p2');
  });

  it('重置 Passkey：scope admin.user.passkey.reset，DELETE 带 proof 头', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(proofOf('proof-passkey-1'));
    API.delete.mockResolvedValueOnce(resp(null));

    let ok;
    await act(async () => {
      ok = await rendered.result.current.resetUserPasskey({ id: 11, username: 'carl' });
    });

    expect(requestVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin.user.passkey.reset',
        context: { user_id: 11 },
      }),
    );
    expect(API.delete).toHaveBeenCalledWith(
      '/api/user/11/reset_passkey',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Security-Proof': 'proof-passkey-1' }),
        singleUseAuthorization: true,
      }),
    );
    expect(ok).toBe(true);
  });

  it('解除 2FA：scope admin.user.2fa.disable，DELETE 带 proof 头', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(proofOf('proof-2fa-1'));
    API.delete.mockResolvedValueOnce(resp(null));

    let ok;
    await act(async () => {
      ok = await rendered.result.current.resetUserTwoFA({ id: 12 });
    });

    expect(requestVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin.user.2fa.disable',
        context: { user_id: 12 },
      }),
    );
    expect(API.delete).toHaveBeenCalledWith(
      '/api/user/12/2fa',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Security-Proof': 'proof-2fa-1' }),
        singleUseAuthorization: true,
      }),
    );
    expect(ok).toBe(true);
  });

  it('取消 Passkey 重置：不发请求也不弹错误', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(null);

    let ok;
    await act(async () => {
      ok = await rendered.result.current.resetUserPasskey({ id: 13 });
    });

    expect(ok).toBe(false);
    expect(API.delete).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('接口失败：展示后端 message 并返回 false', async () => {
    const rendered = await setup();
    requestVerification.mockResolvedValueOnce(proofOf('proof-fail-1'));
    API.post.mockResolvedValueOnce(
      Promise.resolve({ data: { success: false, message: 'boom' } }),
    );

    let ok;
    await act(async () => {
      ok = await rendered.result.current.manageUser(4, 'disable', { id: 4 });
    });

    expect(ok).toBe(false);
    expect(showError).toHaveBeenCalledWith('boom');
    expect(rendered.result.current.loading).toBe(false);
  });
});
