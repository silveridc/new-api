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

import { getBillingModeTag } from '../billingMode';

const t = (key) => key;

describe('getBillingModeTag', () => {
  it('badges a model with a usage schema as task billing, outranking dynamic pricing', () => {
    // 新版 hasTaskUsageSchema 优先级最高（billing-mode.ts:34）
    const model = {
      quota_type: 0,
      billing_mode: 'tiered_expr',
      billing_expr: { expr: 'x' },
      billing_usage_schema: { image_count: { type: 'integer' } },
    };
    expect(getBillingModeTag(model, t)).toEqual({
      mode: 'task',
      text: '任务计费',
      color: 'blue',
    });
    // 空 schema 不算任务计费
    expect(
      getBillingModeTag({ ...model, billing_usage_schema: {} }, t).mode,
    ).toBe('dynamic');
  });

  it('requires a billing expression for dynamic pricing', () => {
    expect(
      getBillingModeTag(
        { quota_type: 0, billing_mode: 'tiered_expr', billing_expr: { e: 1 } },
        t,
      ).mode,
    ).toBe('dynamic');
    // tiered_expr 但没有表达式时不算动态计费，退回 quota_type 判定
    expect(
      getBillingModeTag({ quota_type: 0, billing_mode: 'tiered_expr' }, t).mode,
    ).toBe('token');
  });

  it('reads dynamic pricing from non-ratio plugin variants', () => {
    expect(
      getBillingModeTag(
        {
          quota_type: 0,
          billing_plugin_variants: [
            { billing_mode: 'ratio' },
            { billing_mode: 'tiered_expr', billing_expr: { e: 1 } },
          ],
        },
        t,
      ).mode,
    ).toBe('dynamic');
    expect(
      getBillingModeTag(
        {
          quota_type: 1,
          billing_plugin_variants: [{ billing_mode: 'ratio' }],
        },
        t,
      ).mode,
    ).toBe('per_request');
  });

  it('falls back to quota_type and returns null when it cannot classify', () => {
    expect(getBillingModeTag({ quota_type: 0 }, t)).toEqual({
      mode: 'token',
      text: '按量计费',
      color: 'violet',
    });
    expect(getBillingModeTag({ quota_type: 1 }, t)).toEqual({
      mode: 'per_request',
      text: '按次计费',
      color: 'teal',
    });
    expect(getBillingModeTag({ quota_type: 9 }, t)).toBeNull();
    expect(getBillingModeTag(null, t)).toBeNull();
    expect(getBillingModeTag(undefined, t)).toBeNull();
  });
});
