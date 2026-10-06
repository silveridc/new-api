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
 * 用户管理二次验证（proof token）契约层。
 * scope / context 结构与后端 service/security_verification.go 保持一致：
 * - admin.user.create        → context { role }
 * - admin.user.update        → context { user_id }
 * - admin.user.delete        → context { user_id }
 * - admin.user.manage        → context { user_id, action }
 * - admin.user.passkey.reset → context { user_id }
 * - admin.user.2fa.disable   → context { user_id }
 * - admin.user.binding.clear → context { user_id, binding_type | provider_id }
 */

export const ADMIN_USER_VERIFICATION_SCOPES = {
  CREATE: 'admin.user.create',
  UPDATE: 'admin.user.update',
  DELETE: 'admin.user.delete',
  MANAGE: 'admin.user.manage',
  PASSKEY_RESET: 'admin.user.passkey.reset',
  TWOFA_DISABLE: 'admin.user.2fa.disable',
  BINDING_CLEAR: 'admin.user.binding.clear',
};

// 与后端 adminUserManageActions 对齐；delete 有独立 scope，add_quota 不需要验证
export const ADMIN_USER_MANAGE_ACTIONS = [
  'enable',
  'disable',
  'promote',
  'demote',
];

// 标准角色：普通用户 1 / 管理员 10（后端拒绝其他取值）
export const ADMIN_STANDARD_ROLES = {
  COMMON: 1,
  ADMIN: 10,
};

/**
 * 归一化角色为标准值 1 / 10；非法取值返回 null
 */
export function normalizeUserRole(role) {
  const value = Number(role);
  if (value === ADMIN_STANDARD_ROLES.ADMIN) return ADMIN_STANDARD_ROLES.ADMIN;
  if (value === ADMIN_STANDARD_ROLES.COMMON) return ADMIN_STANDARD_ROLES.COMMON;
  return null;
}

/**
 * 从验证结果中取出可用 proof token；取消 / 无效返回 null
 */
export function resolveProofToken(proof) {
  const token = proof && proof.proof_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * proof 一次性使用：请求必须声明 singleUseAuthorization，
 * api.js 拦截器会先刷新访问令牌且 401 后绝不重放。
 */
export function securityProofConfig(proof) {
  const token = resolveProofToken(proof);
  if (!token) {
    return undefined;
  }
  return {
    headers: { 'X-Security-Proof': token },
    singleUseAuthorization: true,
  };
}

export function adminCreateVerification(role) {
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.CREATE,
    context: { role },
  };
}

export function adminUpdateVerification(userId) {
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.UPDATE,
    context: { user_id: Number(userId) },
  };
}

export function adminDeleteVerification(userId) {
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.DELETE,
    context: { user_id: Number(userId) },
  };
}

export function adminManageVerification(userId, action) {
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.MANAGE,
    context: { user_id: Number(userId), action },
  };
}

export function adminPasskeyResetVerification(userId) {
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.PASSKEY_RESET,
    context: { user_id: Number(userId) },
  };
}

export function adminTwoFADisableVerification(userId) {
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.TWOFA_DISABLE,
    context: { user_id: Number(userId) },
  };
}

/**
 * 清除绑定：内置绑定用 binding_type，自定义 OAuth 用 provider_id（二选一）
 */
export function adminBindingClearVerification(userId, { bindingType, providerId } = {}) {
  const context = { user_id: Number(userId) };
  if (bindingType) {
    context.binding_type = String(bindingType);
  } else if (providerId !== undefined && providerId !== null) {
    context.provider_id = Number(providerId);
  }
  return {
    scope: ADMIN_USER_VERIFICATION_SCOPES.BINDING_CLEAR,
    context,
  };
}
