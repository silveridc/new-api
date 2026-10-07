/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { API } from '../helpers';

/**
 * 请求策略（request policy）保存契约。契约来源：
 * - 后端 router/api-router.go:216-217
 *   GET  /api/option/request_policy（AdminAuth）
 *   PATCH /api/option/request_policy（AdminAuth，原子更新 + 整体校验）
 * - 后端 controller/request_policy.go:14 UpdateRequestPolicy
 *   请求体 { options: Record<string, string> }，成功后回传 GET 响应
 *   { success, message, data: { options } }；任一 key 非法则整体 400。
 * - 后端 model/request_policy.go:74 IsRequestPolicyOption 决定哪些 key
 *   属于策略集合（channel_affinity_setting.*、monitor_setting.* 部分、
 *   重试/禁用相关标量）；不属于的 key 必须继续走 PUT /api/option/。
 */

export const CHANNEL_TEST_MODES = [
  { value: 'scheduled_all', label: '定时测试全部渠道' },
  { value: 'auto_ban_only', label: '仅自动禁用' },
  { value: 'passive_recovery', label: '被动恢复' },
];

export const MAX_CHANNEL_TEST_CONCURRENCY = 32;

export const SESSION_MODE_OPTIONS = [
  { value: 'off', label: '不保持会话' },
  { value: 'prefer', label: '优先原渠道，允许切换' },
  { value: 'strict', label: '严格保持原渠道' },
];

export const RULE_SESSION_MODE_OPTIONS = [
  { value: 'inherit', label: '跟随全局' },
  ...SESSION_MODE_OPTIONS,
];

// 与 model/request_policy.go IsRequestPolicyOption 保持一致的 key 集合。
const REQUEST_POLICY_SCALAR_KEYS = new Set([
  'CheckSensitiveEnabled',
  'CheckSensitiveOnPromptEnabled',
  'SensitiveWords',
  'AutomaticEnableChannelEnabled',
  'ChannelDisableThreshold',
  'monitor_setting.auto_test_channel_enabled',
  'monitor_setting.auto_test_channel_minutes',
  'monitor_setting.channel_test_concurrency',
  'monitor_setting.channel_test_mode',
  'RetryTimes',
  'AutomaticRetryStatusCodes',
  'AutomaticDisableChannelEnabled',
  'AutomaticDisableStatusCodes',
  'AutomaticDisableKeywords',
]);

export function isRequestPolicyOptionKey(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('channel_affinity_setting.')) return true;
  return REQUEST_POLICY_SCALAR_KEYS.has(key);
}

/**
 * 把要保存的 key/value 集合拆成两组：
 * - policy：走 PATCH /api/option/request_policy（原子保存，整体校验）
 * - legacy：走 PUT /api/option/（逐 key 保存）
 * getValue 缺失时直接把 key 映射为 value。
 */
export function partitionOptionChanges(entries) {
  const policy = {};
  const legacy = {};
  for (const [key, value] of Object.entries(entries || {})) {
    if (isRequestPolicyOptionKey(key)) {
      policy[key] = value;
    } else {
      legacy[key] = value;
    }
  }
  return { policy, legacy };
}

/**
 * 原子保存请求策略。成功返回服务端回传的最新 options。
 */
export async function saveRequestPolicyOptions(options) {
  const res = await API.patch('/api/option/request_policy', { options });
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '保存失败，请重试');
  }
  return data?.options || {};
}

/**
 * GET /api/option/request_policy。返回解包后的 options map。
 */
export async function getRequestPolicyOptions() {
  const res = await API.get('/api/option/request_policy');
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '获取请求策略失败');
  }
  return data?.options || {};
}

/**
 * monitor_setting.channel_test_concurrency 合法范围 1..32
 * （model/request_policy.go 校验失败会整体 400）。
 */
export function normalizeChannelTestConcurrency(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_CHANNEL_TEST_CONCURRENCY) return MAX_CHANNEL_TEST_CONCURRENCY;
  return n;
}

export function isChannelTestMode(value) {
  return CHANNEL_TEST_MODES.some((mode) => mode.value === value);
}

/**
 * 规则 session_mode 合法值（model/request_policy.go:166-172）：
 * ''/'inherit'/'off'/'prefer'/'strict'。
 */
export function isRuleSessionMode(value) {
  return RULE_SESSION_MODE_OPTIONS.some((option) => option.value === value);
}

/**
 * 全局 session_mode 合法值（model/request_policy.go:158-165）：
 * ''/'off'/'prefer'/'strict'。
 */
export function isGlobalSessionMode(value) {
  return (
    value === '' || SESSION_MODE_OPTIONS.some((option) => option.value === value)
  );
}
