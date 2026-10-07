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
 * 计费用量 Schema（usage schema）展示层服务。契约来源：
 * - 新版前端 web/src/features/pricing/types.ts billing_usage_schema
 *   与 web/src/features/model-pricing/api.ts ModelPricingPluginVariant
 * - 后端 /api/pricing 响应（controller/pricing.go GetPricing）：
 *   Pricing.BillingUsageSchema / Pricing.BillingUsageExamples /
 *   Pricing.BillingPluginVariants[].BillingUsageSchema
 * - 后端 pkg/jsplugin/registry.go:51 LocalizedText（对象 { lang: text }）、
 *   :172 UsageExample { label, facts }、:189 UsageFieldSchema
 *   { type, unit, unitLabel, enum, description, enumLabels }。
 */

/**
 * LocalizedText 可能是对象（{ zh: '…', en: '…' }）或旧版字符串。
 * 依次尝试请求语言 → 中文 → 英文 → 任意首个值。
 */
export function pickLocalizedText(value, lang) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const candidates = [lang, lang?.split('-')[0], 'zh', 'zh-CN', 'en'];
    for (const key of candidates) {
      if (key && typeof value[key] === 'string' && value[key]) return value[key];
    }
    const first = Object.values(value).find(
      (v) => typeof v === 'string' && v.length > 0,
    );
    return first || '';
  }
  return String(value);
}

/**
 * 把 UsageFieldSchema map 展平为表格行（保持字段名字母序，稳定渲染）。
 */
export function buildUsageSchemaRows(schema, lang = 'zh') {
  if (!schema || typeof schema !== 'object') return [];
  return Object.entries(schema)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, def]) => {
      const d = def || {};
      return {
        key: field,
        field,
        type: d.type || '-',
        unit:
          pickLocalizedText(d.unitLabel, lang) || pickLocalizedText(d.unit, lang) || '-',
        description: pickLocalizedText(d.description, lang) || '-',
        enum_values: Array.isArray(d.enum)
          ? d.enum.map((value) => ({
              value,
              label:
                pickLocalizedText(d.enumLabels?.[value], lang) || value,
            }))
          : [],
      };
    });
}

/**
 * 计费插件变体（billing_plugin_variants）展示行。
 */
export function buildPluginVariantRows(variants, lang = 'zh') {
  if (!Array.isArray(variants)) return [];
  return variants.map((variant) => ({
    key: variant?.plugin_key || variant?.plugin_name || '-',
    plugin_key: variant?.plugin_key || '-',
    plugin_name: variant?.plugin_name || '-',
    icon: variant?.icon || '',
    compatible: variant?.compatible !== false,
    configured: variant?.configured || '',
    effective: variant?.effective || '',
    schema_rows: buildUsageSchemaRows(variant?.billing_usage_schema, lang),
    examples: Array.isArray(variant?.billing_usage_examples)
      ? variant.billing_usage_examples.map((example) => ({
          label: pickLocalizedText(example?.label, lang) || example?.label || '-',
          facts: example?.facts || {},
        }))
      : [],
  }));
}

/**
 * 汇总一个模型上所有需要展示的 usage schema（主 schema + 各插件变体）。
 */
export function collectModelUsageSchemas(modelData, lang = 'zh') {
  if (!modelData || typeof modelData !== 'object') return [];
  const sections = [];
  const mainRows = buildUsageSchemaRows(modelData.billing_usage_schema, lang);
  if (mainRows.length > 0) {
    sections.push({
      key: 'main',
      title: modelData.billing_mode === 'tiered_expr' ? '动态计费' : '计费用量',
      rows: mainRows,
      examples: Array.isArray(modelData.billing_usage_examples)
        ? modelData.billing_usage_examples.map((example) => ({
            label: pickLocalizedText(example?.label, lang) || example?.label || '-',
            facts: example?.facts || {},
          }))
        : [],
    });
  }
  for (const variant of buildPluginVariantRows(
    modelData.billing_plugin_variants,
    lang,
  )) {
    if (variant.schema_rows.length === 0) continue;
    sections.push({
      key: `plugin-${variant.plugin_key}`,
      title: variant.plugin_name,
      rows: variant.schema_rows,
      examples: variant.examples,
    });
  }
  return sections;
}
