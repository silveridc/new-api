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
  ADMIN_USER_VERIFICATION_SCOPES,
  adminBindingClearVerification,
  adminCreateVerification,
  adminDeleteVerification,
  adminManageVerification,
  adminPasskeyResetVerification,
  adminTwoFADisableVerification,
  adminUpdateVerification,
  normalizeUserRole,
  resolveProofToken,
  securityProofConfig,
} from '../userSecurity';

describe('userSecurity 二次验证契约层', () => {
  it('securityProofConfig：带 X-Security-Proof 头并声明 singleUseAuthorization', () => {
    const config = securityProofConfig({ proof_token: 'tok-1' });
    expect(config).toEqual({
      headers: { 'X-Security-Proof': 'tok-1' },
      singleUseAuthorization: true,
    });
  });

  it('securityProofConfig：取消（null）或空 token 时返回 undefined', () => {
    expect(securityProofConfig(null)).toBeUndefined();
    expect(securityProofConfig(undefined)).toBeUndefined();
    expect(securityProofConfig({})).toBeUndefined();
    expect(securityProofConfig({ proof_token: '' })).toBeUndefined();
  });

  it('resolveProofToken：只接受非空字符串 token', () => {
    expect(resolveProofToken({ proof_token: 'tok' })).toBe('tok');
    expect(resolveProofToken(null)).toBeNull();
    expect(resolveProofToken({ proof_token: 123 })).toBeNull();
  });

  it('创建管理员：scope admin.user.create，context 带 role', () => {
    expect(adminCreateVerification(10)).toEqual({
      scope: 'admin.user.create',
      context: { role: 10 },
    });
  });

  it('更新用户：scope admin.user.update，context 只带 user_id', () => {
    expect(adminUpdateVerification('7')).toEqual({
      scope: 'admin.user.update',
      context: { user_id: 7 },
    });
  });

  it('硬删除：scope admin.user.delete，context 只带 user_id', () => {
    expect(adminDeleteVerification(9)).toEqual({
      scope: 'admin.user.delete',
      context: { user_id: 9 },
    });
  });

  it('管理动作：scope admin.user.manage，context 带 user_id 与 action', () => {
    expect(adminManageVerification(3, 'disable')).toEqual({
      scope: 'admin.user.manage',
      context: { user_id: 3, action: 'disable' },
    });
  });

  it('重置 Passkey / 解除 2FA 各自独立 scope，context 带 user_id', () => {
    expect(adminPasskeyResetVerification(11)).toEqual({
      scope: 'admin.user.passkey.reset',
      context: { user_id: 11 },
    });
    expect(adminTwoFADisableVerification(12)).toEqual({
      scope: 'admin.user.2fa.disable',
      context: { user_id: 12 },
    });
  });

  it('清绑定：内置绑定用 binding_type，自定义 OAuth 用 provider_id', () => {
    expect(
      adminBindingClearVerification(6, { bindingType: 'github' }),
    ).toEqual({
      scope: ADMIN_USER_VERIFICATION_SCOPES.BINDING_CLEAR,
      context: { user_id: 6, binding_type: 'github' },
    });
    expect(
      adminBindingClearVerification(6, { providerId: '7' }),
    ).toEqual({
      scope: 'admin.user.binding.clear',
      context: { user_id: 6, provider_id: 7 },
    });
  });

  it('normalizeUserRole：仅允许标准 1 / 10', () => {
    expect(normalizeUserRole(1)).toBe(1);
    expect(normalizeUserRole('10')).toBe(10);
    expect(normalizeUserRole(5)).toBeNull();
    expect(normalizeUserRole(100)).toBeNull();
    expect(normalizeUserRole(-1)).toBeNull();
    expect(normalizeUserRole(undefined)).toBeNull();
  });
});
