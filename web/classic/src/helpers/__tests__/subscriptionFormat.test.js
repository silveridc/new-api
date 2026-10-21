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
  DEFAULT_QUOTA_PER_UNIT,
  getSubscriptionBalanceQuota,
} from '../subscriptionFormat';

describe('getSubscriptionBalanceQuota', () => {
  it('rounds the wallet charge up like the backend does', () => {
    // 0.03 USD × 500000 = 15000；0.000001 × 500000 = 0.5 → 1，非整数必须进位
    expect(getSubscriptionBalanceQuota(0.03, 500000)).toBe(15000);
    expect(getSubscriptionBalanceQuota(19.99, 500000)).toBe(9995000);
    expect(getSubscriptionBalanceQuota(0.000001, 500000)).toBe(1);
  });

  it('does not overcharge by one from floating point noise', () => {
    // 4.03 × 500000 在 JS 里是 2015000.0000000002，直接 Math.ceil 会多算 1 个额度
    expect(getSubscriptionBalanceQuota(4.03, 500000)).toBe(2015000);
    expect(getSubscriptionBalanceQuota(4.07, 500000)).toBe(2035000);
    expect(getSubscriptionBalanceQuota(8.05, 500000)).toBe(4025000);
  });

  it('charges nothing for free or invalid prices', () => {
    expect(getSubscriptionBalanceQuota(0, 500000)).toBe(0);
    expect(getSubscriptionBalanceQuota(-1, 500000)).toBe(0);
    expect(getSubscriptionBalanceQuota(undefined, 500000)).toBe(0);
    expect(getSubscriptionBalanceQuota('abc', 500000)).toBe(0);
  });

  it('falls back to the backend default when quota_per_unit is unavailable', () => {
    // status 还没拉到：localStorage 里是 null / '' / NaN，不能算出 NaN 再和余额比
    expect(DEFAULT_QUOTA_PER_UNIT).toBe(500000);
    expect(getSubscriptionBalanceQuota(2, null)).toBe(1000000);
    expect(getSubscriptionBalanceQuota(2, Number.NaN)).toBe(1000000);
    expect(getSubscriptionBalanceQuota(2, 0)).toBe(1000000);
    expect(getSubscriptionBalanceQuota(2, -1)).toBe(1000000);
  });

  it('honours a custom quota_per_unit', () => {
    expect(getSubscriptionBalanceQuota(2, 1000)).toBe(2000);
  });
});
