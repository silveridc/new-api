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

/**
 * 令牌 Auto 分组（auto_groups）。契约来源：
 * - 新版 web/src/features/keys/lib/api-key-form.ts（inherit/custom 两态与转换）
 * - 后端 GET /api/token/auto-groups（controller/token.go:176）返回
 *   { groups: string[], max_count: number }：groups 为按全局顺序过滤出的
 *   当前用户可选 Auto 分组，max_count 为单令牌自定义上限。
 * - 后端 POST/PUT /api/token/（controller/token.go）接收 auto_groups: string[]：
 *   仅当 group==='auto' 时生效；传空数组表示清除（即继承全局 Auto 顺序）。
 *   group!=='auto' 时后端一律清空 auto_groups 并置 cross_group_retry=false。
 *   PUT 的 auto_groups 字段只要出现（含 []）即触发更新（后端 Set 标记）。
 */

// 与后端 setting.DefaultMaxTokenAutoGroups 对齐
export const DEFAULT_MAX_TOKEN_AUTO_GROUPS = 5;

const normalizeMaxCount = (value) =>
  Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_TOKEN_AUTO_GROUPS;

/**
 * 拉取当前用户的全局 Auto 顺序与单令牌上限。
 * @returns {Promise<{groups: string[], maxCount: number}>}
 */
export async function getTokenAutoGroups() {
  const res = await API.get('/api/token/auto-groups');
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || 'Failed to load auto groups');
  }
  return {
    groups: Array.isArray(data?.groups) ? data.groups : [],
    maxCount: normalizeMaxCount(data?.max_count),
  };
}

/**
 * 由后端令牌数据推导表单的 Auto 分组状态。
 * 已存自定义分组则为 custom（过滤掉当前不可选的、截断到上限），否则 inherit。
 * @param {{auto_groups?: string[]}} token
 * @param {string[]} availableGroups 当前可选分组名（用于过滤历史失效分组）
 * @param {number} maxCount
 * @returns {{auto_groups_mode: 'inherit'|'custom', auto_groups: string[]}}
 */
export function deriveTokenAutoGroupsForm(
  token,
  availableGroups = [],
  maxCount = DEFAULT_MAX_TOKEN_AUTO_GROUPS,
) {
  const max = normalizeMaxCount(maxCount);
  const stored = Array.isArray(token?.auto_groups) ? token.auto_groups : [];
  // availableGroups 为空时视为「可选集未知」，不做可选性过滤，避免与分组列表
  // 加载竞态时误删已存分组（宁可多留，提交时后端仍会校验）。
  const hasFilter =
    Array.isArray(availableGroups) && availableGroups.length > 0;
  const available = new Set(availableGroups);
  const autoGroups = stored
    .filter((group) => !hasFilter || available.has(group))
    .slice(0, Math.max(0, max));
  return {
    auto_groups_mode: stored.length > 0 ? 'custom' : 'inherit',
    auto_groups: autoGroups,
  };
}

/**
 * 由表单状态构造提交给后端的 auto_groups 数组。
 * 仅 group==='auto' 且 custom 模式下回传所选分组，其余一律 []（= 继承/清除）。
 * @param {{group?: string, auto_groups_mode?: string, auto_groups?: string[]}} form
 * @returns {string[]}
 */
export function buildTokenAutoGroupsPayload(form) {
  if (
    form?.group === 'auto' &&
    form?.auto_groups_mode === 'custom' &&
    Array.isArray(form?.auto_groups)
  ) {
    return form.auto_groups;
  }
  return [];
}
