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

// modal 模块在 import 时会加载 semi-ui barrel（连带 lottie-web 需要 canvas），
// 以及 helpers / hooks；统一打桩后仅测试导出的契约层。
vi.hoisted(() => {
  if (typeof window !== 'undefined') {
    const noop = () => {};
    const stubContext = new Proxy(
      {},
      {
        get: (target, prop) => {
          if (prop === 'canvas') {
            return { width: 0, height: 0 };
          }
          return noop;
        },
        set: () => true,
      },
    );
    window.HTMLCanvasElement.prototype.getContext = () => stubContext;
  }
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s) => s }),
}));

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

vi.mock('../../../../../helpers', () => ({
  API,
  showError,
  showSuccess,
  renderQuota: vi.fn(),
  getCurrencyConfig: () => ({ symbol: '$' }),
  isRoot: vi.fn(() => true),
  requestVerification,
}));

vi.mock('../../../../../helpers/quota', () => ({
  quotaToDisplayAmount: (quota) => Number(quota) / 500000,
  displayAmountToQuota: (amount) => Number(amount) * 500000,
}));

vi.mock('../../../../../hooks/common/useIsMobile', () => ({
  useIsMobile: () => false,
}));

import { submitCreateUser } from '../AddUserModal';
import { buildUpdateIntent, submitUpdateUser } from '../EditUserModal';
import { performUnbind } from '../UserBindingManagementModal';
import DeleteUserModal from '../DeleteUserModal';

// 与后端 /api/authz/catalog 响应结构一致
const CATALOG = {
  resources: [
    {
      resource: 'audit',
      label_key: 'audit',
      actions: [
        { action: 'read', label_key: 'audit.read', description_key: 'd1' },
        { action: 'write', label_key: 'audit.write', description_key: 'd2' },
      ],
    },
    {
      resource: 'channel',
      label_key: 'channel',
      actions: [
        { action: 'read', label_key: 'channel.read', description_key: 'd3' },
        { action: 'operate', label_key: 'channel.op', description_key: 'd4' },
        { action: 'sensitive_write', label_key: 'channel.sw', description_key: 'd5' },
      ],
    },
  ],
  roles: [
    {
      key: 'admin',
      name: 'Admin',
      built_in: true,
      superuser: false,
      grants: { audit: { read: true }, channel: { read: true } },
    },
  ],
};

const proofOf = (token) => ({ proof_token: token });

describe('DeleteUserModal（硬删除确认弹窗）', () => {
  it('模块语法可用且导出组件（确认回调内的 proof 由 useUsersData.manageUser 提供）', () => {
    expect(typeof DeleteUserModal).toBe('function');
  });
});

describe('AddUserModal.submitCreateUser', () => {
  beforeEach(() => {
    requestVerification.mockClear();
    API.post.mockClear();
  });

  it('创建管理员：先取 admin.user.create proof，请求带 role=10 与 proof 头', async () => {
    requestVerification.mockResolvedValueOnce(proofOf('proof-create-1'));
    API.post.mockResolvedValueOnce({ data: { success: true } });
    const onSuccess = vi.fn();

    const ok = await submitCreateUser({
      values: { username: 'neo', password: 'secret-password', role: 10 },
      verify: requestVerification,
      api: API,
      onSuccess,
      onError: showError,
    });

    expect(ok).toBe(true);
    expect(requestVerification).toHaveBeenCalledTimes(1);
    expect(requestVerification).toHaveBeenCalledWith({
      scope: 'admin.user.create',
      context: { role: 10 },
    });
    expect(API.post).toHaveBeenCalledWith(
      '/api/user/',
      expect.objectContaining({ username: 'neo', role: 10 }),
      expect.objectContaining({
        headers: { 'X-Security-Proof': 'proof-create-1' },
        singleUseAuthorization: true,
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it('创建普通用户（role=1 显式）：不触发验证', async () => {
    API.post.mockClear();
    API.post.mockResolvedValueOnce({ data: { success: true } });

    await submitCreateUser({
      values: { username: 'amy', role: 1 },
      verify: requestVerification,
      api: API,
    });

    expect(requestVerification).not.toHaveBeenCalled();
    expect(API.post).toHaveBeenCalledWith(
      '/api/user/',
      expect.objectContaining({ role: 1 }),
      undefined,
    );
  });

  it('取消验证：不发请求、不报错、返回 false', async () => {
    requestVerification.mockResolvedValueOnce(null);

    const ok = await submitCreateUser({
      values: { username: 'neo', role: 10 },
      verify: requestVerification,
      api: API,
      onError: showError,
    });

    expect(ok).toBe(false);
    expect(API.post).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('非法角色（5）归一化为普通用户 1，不触发验证', async () => {
    API.post.mockResolvedValueOnce({ data: { success: true } });

    await submitCreateUser({
      values: { username: 'odd', role: 5 },
      verify: requestVerification,
      api: API,
    });

    expect(requestVerification).not.toHaveBeenCalled();
    expect(API.post).toHaveBeenCalledWith(
      '/api/user/',
      expect.objectContaining({ role: 1 }),
      undefined,
    );
  });
});

describe('EditUserModal.buildUpdateIntent / submitUpdateUser', () => {
  beforeEach(() => {
    requestVerification.mockClear();
    API.put.mockClear();
  });

  it('改密码：需要 admin.user.update proof，context 带 user_id', () => {
    const intent = buildUpdateIntent({
      values: { username: 'bob', password: 'new-password-1' },
      userId: 7,
      canEditPermissions: true,
      targetIsAdmin: true,
      catalog: CATALOG,
      loadedPermissions: {},
      currentPermissions: {},
    });

    expect(intent.permissionsChanged).toBe(false);
    expect(intent.verification).toEqual({
      scope: 'admin.user.update',
      context: { user_id: 7 },
    });
    expect(intent.payload.password).toBe('new-password-1');
    expect(intent.payload.admin_permissions).toBeUndefined();
  });

  it('矩阵变化：payload 携带按 catalog 归一化的完整矩阵并要求 proof', () => {
    const loaded = {
      audit: { read: true, write: false },
      channel: { read: true, operate: false, sensitive_write: false },
    };
    const current = {
      audit: { read: true, write: false },
      channel: { read: true, operate: true, sensitive_write: false },
    };

    const intent = buildUpdateIntent({
      values: { username: 'bob', password: '' },
      userId: 7,
      canEditPermissions: true,
      targetIsAdmin: true,
      catalog: CATALOG,
      loadedPermissions: loaded,
      currentPermissions: current,
    });

    expect(intent.permissionsChanged).toBe(true);
    expect(intent.verification).toEqual({
      scope: 'admin.user.update',
      context: { user_id: 7 },
    });
    // 归一化后的完整矩阵（缺失 cell 补 false）
    expect(intent.payload.admin_permissions).toEqual({
      audit: { read: true, write: false },
      channel: { read: true, operate: true, sensitive_write: false },
    });
  });

  it('矩阵未变化：绝不发送 admin_permissions，也不要求 proof', () => {
    const loaded = {
      audit: { read: true, write: false },
      channel: { read: true, operate: false, sensitive_write: false },
    };

    const intent = buildUpdateIntent({
      // 模拟 Semi Form setValues 残留的 admin_permissions 字段
      values: { username: 'bob', remark: 'hello', admin_permissions: loaded },
      userId: 7,
      canEditPermissions: true,
      targetIsAdmin: true,
      catalog: CATALOG,
      loadedPermissions: loaded,
      currentPermissions: loaded,
    });

    expect(intent.permissionsChanged).toBe(false);
    expect(intent.verification).toBeNull();
    expect(intent.payload.admin_permissions).toBeUndefined();
    expect(intent.payload.remark).toBe('hello');
  });

  it('普通管理员（非 root）编辑：矩阵不参与，仅密码触发 proof', () => {
    const intent = buildUpdateIntent({
      values: { username: 'bob', password: '' },
      userId: 7,
      canEditPermissions: false,
      targetIsAdmin: true,
      catalog: CATALOG,
      loadedPermissions: {},
      currentPermissions: { audit: { read: true, write: true } },
    });

    expect(intent.permissionsChanged).toBe(false);
    expect(intent.verification).toBeNull();
    expect(intent.payload.admin_permissions).toBeUndefined();
  });

  it('普通资料更新：不要求 proof', () => {
    const intent = buildUpdateIntent({
      values: { username: 'bob', display_name: 'Bob', remark: 'x' },
      userId: 7,
      canEditPermissions: true,
      targetIsAdmin: true,
      catalog: CATALOG,
      loadedPermissions: {},
      currentPermissions: {},
    });

    expect(intent.verification).toBeNull();
  });

  it('submitUpdateUser：带 verification 时先取 proof，请求带 proof 头', async () => {
    requestVerification.mockResolvedValueOnce(proofOf('proof-update-1'));
    API.put.mockResolvedValueOnce({ data: { success: true } });

    const ok = await submitUpdateUser({
      url: '/api/user/',
      payload: { id: 7, username: 'bob', password: 'new-password-1' },
      verification: { scope: 'admin.user.update', context: { user_id: 7 } },
      verify: requestVerification,
      api: API,
    });

    expect(ok).toBe(true);
    expect(requestVerification).toHaveBeenCalledWith({
      scope: 'admin.user.update',
      context: { user_id: 7 },
    });
    expect(API.put).toHaveBeenCalledWith(
      '/api/user/',
      expect.objectContaining({ id: 7 }),
      expect.objectContaining({
        headers: { 'X-Security-Proof': 'proof-update-1' },
        singleUseAuthorization: true,
      }),
    );
  });

  it('submitUpdateUser：取消验证则不发请求', async () => {
    requestVerification.mockResolvedValueOnce(null);

    const ok = await submitUpdateUser({
      url: '/api/user/',
      payload: { id: 7 },
      verification: { scope: 'admin.user.update', context: { user_id: 7 } },
      verify: requestVerification,
      api: API,
      onError: showError,
    });

    expect(ok).toBe(false);
    expect(API.put).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('submitUpdateUser：无 verification 直接 PUT，不触发验证', async () => {
    API.put.mockResolvedValueOnce({ data: { success: true } });

    await submitUpdateUser({
      url: '/api/user/',
      payload: { id: 7, remark: 'x' },
      verification: null,
      verify: requestVerification,
      api: API,
    });

    expect(requestVerification).not.toHaveBeenCalled();
    expect(API.put).toHaveBeenCalledWith(
      '/api/user/',
      expect.objectContaining({ id: 7 }),
      undefined,
    );
  });
});

describe('UserBindingManagementModal.performUnbind', () => {
  beforeEach(() => {
    requestVerification.mockClear();
    API.delete.mockClear();
    showError.mockClear();
  });

  it('解绑内置账户：scope admin.user.binding.clear，context 带 binding_type，请求带 proof 头', async () => {
    requestVerification.mockResolvedValueOnce(proofOf('proof-bind-1'));
    API.delete.mockResolvedValueOnce({ data: { success: true } });
    const onSuccess = vi.fn();

    const ok = await performUnbind({
      url: '/api/user/6/bindings/github',
      verification: {
        scope: 'admin.user.binding.clear',
        context: { user_id: 6, binding_type: 'github' },
      },
      verify: requestVerification,
      api: API,
      onSuccess,
      onError: showError,
    });

    expect(ok).toBe(true);
    expect(requestVerification).toHaveBeenCalledWith({
      scope: 'admin.user.binding.clear',
      context: { user_id: 6, binding_type: 'github' },
    });
    expect(API.delete).toHaveBeenCalledWith(
      '/api/user/6/bindings/github',
      expect.objectContaining({
        headers: { 'X-Security-Proof': 'proof-bind-1' },
        singleUseAuthorization: true,
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it('解绑自定义 OAuth：context 带 provider_id', async () => {
    requestVerification.mockResolvedValueOnce(proofOf('proof-bind-2'));
    API.delete.mockResolvedValueOnce({ data: { success: true } });

    await performUnbind({
      url: '/api/user/6/oauth/bindings/7',
      verification: {
        scope: 'admin.user.binding.clear',
        context: { user_id: 6, provider_id: 7 },
      },
      verify: requestVerification,
      api: API,
    });

    expect(requestVerification).toHaveBeenCalledWith({
      scope: 'admin.user.binding.clear',
      context: { user_id: 6, provider_id: 7 },
    });
  });

  it('取消验证：不发请求、不报错', async () => {
    requestVerification.mockResolvedValueOnce(null);

    const ok = await performUnbind({
      url: '/api/user/6/bindings/github',
      verification: { scope: 'admin.user.binding.clear', context: { user_id: 6 } },
      verify: requestVerification,
      api: API,
      onError: showError,
    });

    expect(ok).toBe(false);
    expect(API.delete).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('后端返回失败：onError 收到 message，返回 false', async () => {
    requestVerification.mockResolvedValueOnce(proofOf('proof-bind-3'));
    API.delete.mockResolvedValueOnce({
      data: { success: false, message: 'binding in use' },
    });
    const onError = vi.fn();

    const ok = await performUnbind({
      url: '/api/user/6/bindings/github',
      verification: { scope: 'admin.user.binding.clear', context: { user_id: 6 } },
      verify: requestVerification,
      api: API,
      onError,
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith('binding in use');
  });
});
