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
 * 模型计费模式判定。契约来源：
 * - 新版前端 web/src/features/pricing/lib/billing-mode.ts（优先级）
 *   与 lib/dynamic-price.ts isDynamicPricingModel / hasTaskUsageSchema
 * - 后端 /api/pricing 响应字段 billing_mode / billing_expr / billing_usage_schema /
 *   billing_plugin_variants / quota_type
 *
 * 优先级：任务计费 > 动态计费 > 按量计费 > 按次计费。
 */

const hasTaskUsageSchema = (model) => {
  const schema = model?.billing_usage_schema;
  return Boolean(schema) && Object.keys(schema).length > 0;
};

const isDynamicPricingModel = (model) => {
  const variants = Array.isArray(model?.billing_plugin_variants)
    ? model.billing_plugin_variants
    : [];
  if (variants.length > 0) {
    return variants.some(
      (variant) =>
        variant?.billing_mode !== 'ratio' && Boolean(variant?.billing_expr),
    );
  }
  return model?.billing_mode === 'tiered_expr' && Boolean(model?.billing_expr);
};

/**
 * 返回 { mode, text, color }；quota_type 缺失或异常时返回 null，由调用方展示 '-'。
 */
export function getBillingModeTag(model, t) {
  if (hasTaskUsageSchema(model)) {
    return { mode: 'task', text: t('任务计费'), color: 'blue' };
  }
  if (isDynamicPricingModel(model)) {
    return { mode: 'dynamic', text: t('动态计费'), color: 'amber' };
  }
  if (model?.quota_type === 0) {
    return { mode: 'token', text: t('按量计费'), color: 'violet' };
  }
  if (model?.quota_type === 1) {
    return { mode: 'per_request', text: t('按次计费'), color: 'teal' };
  }
  return null;
}
