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
  pickLocalizedText,
  buildUsageSchemaRows,
  buildPluginVariantRows,
  collectModelUsageSchemas,
} from '../usageSchema';

// 样例结构对齐 pkg/jsplugin/registry.go UsageFieldSchema / UsageExample
// 与 model/pricing.go Pricing.BillingUsageSchema。
describe('usageSchema display service contract', () => {
  it('resolves localized text with lang fallback chain', () => {
    expect(pickLocalizedText({ zh: '输入', en: 'Input' }, 'zh-CN')).toBe('输入');
    expect(pickLocalizedText({ zh: '输入', en: 'Input' }, 'en-US')).toBe('Input');
    expect(pickLocalizedText({ en: 'Input' }, 'zh-CN')).toBe('Input');
    expect(pickLocalizedText('plain', 'zh')).toBe('plain');
    expect(pickLocalizedText({}, 'zh')).toBe('');
    expect(pickLocalizedText(undefined, 'zh')).toBe('');
  });

  it('flattens usage schema into sorted rows', () => {
    const rows = buildUsageSchemaRows({
      input_tokens: {
        type: 'integer',
        unit: 'tokens',
        unitLabel: { zh: '令牌', en: 'tokens' },
        description: { zh: '输入令牌数', en: 'Input tokens' },
      },
      cache_type: {
        type: 'string',
        enum: ['default', 'ephemeral'],
        enumLabels: { default: { en: 'Default' } },
      },
    });
    expect(rows.map((r) => r.field)).toEqual(['cache_type', 'input_tokens']);
    expect(rows[1]).toMatchObject({
      type: 'integer',
      unit: '令牌',
      description: '输入令牌数',
    });
    expect(rows[0].enum_values).toEqual([
      { value: 'default', label: 'Default' },
      { value: 'ephemeral', label: 'ephemeral' },
    ]);
    expect(buildUsageSchemaRows(null)).toEqual([]);
  });

  it('builds plugin variant rows with schemas and examples', () => {
    const rows = buildPluginVariantRows([
      {
        plugin_key: 'web_search',
        plugin_name: 'Web Search',
        compatible: true,
        configured: '$2/1k',
        effective: '$2/1k',
        billing_usage_schema: {
          queries: { type: 'integer', unitLabel: { en: 'queries' } },
        },
        billing_usage_examples: [
          { label: { en: '3 queries' }, facts: { queries: 3 } },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      plugin_key: 'web_search',
      plugin_name: 'Web Search',
      compatible: true,
      effective: '$2/1k',
    });
    expect(rows[0].schema_rows[0].field).toBe('queries');
    expect(rows[0].examples[0]).toEqual({
      label: '3 queries',
      facts: { queries: 3 },
    });
    expect(buildPluginVariantRows(undefined)).toEqual([]);
  });

  it('collects main schema plus plugin variant sections', () => {
    const sections = collectModelUsageSchemas({
      billing_mode: 'tiered_expr',
      billing_usage_schema: {
        input_tokens: { type: 'integer', unit: 'tokens' },
      },
      billing_usage_examples: [{ label: '标准请求', facts: { input_tokens: 100 } }],
      billing_plugin_variants: [
        {
          plugin_key: 'web_search',
          plugin_name: 'Web Search',
          billing_usage_schema: { queries: { type: 'integer' } },
        },
        { plugin_key: 'noop', plugin_name: 'No Schema' },
      ],
    });
    expect(sections.map((s) => s.key)).toEqual(['main', 'plugin-web_search']);
    expect(sections[0].title).toBe('动态计费');
    expect(sections[0].examples[0].label).toBe('标准请求');
    expect(sections[1].rows[0].field).toBe('queries');
  });

  it('returns empty for models without usage schema', () => {
    expect(collectModelUsageSchemas({ model_name: 'gpt-4o' })).toEqual([]);
    expect(collectModelUsageSchemas(null)).toEqual([]);
  });
});
