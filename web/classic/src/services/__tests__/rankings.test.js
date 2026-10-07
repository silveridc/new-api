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

const { API } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  RANKING_PERIODS,
  normalizeRankingPeriod,
  getRankings,
  formatSharePct,
  formatGrowthPct,
  formatTokenCount,
  buildModelRows,
  buildVendorRows,
  buildMoverRows,
} from '../rankings';

// 契约样例来自后端 service/rankings.go RankingsResponse / RankedModel /
// RankedVendor / RankingMover 的 JSON 标签。
const SNAPSHOT = {
  models: [
    {
      rank: 1,
      previous_rank: 2,
      model_name: 'gpt-4o',
      vendor: 'OpenAI',
      category: 'programming',
      total_tokens: 1234567,
      share: 0.42,
      growth_pct: 12.4,
    },
    {
      rank: 2,
      model_name: 'claude-3',
      vendor: 'Anthropic',
      category: 'roleplay',
      total_tokens: 900,
      share: 0.1,
      growth_pct: -5,
    },
  ],
  vendors: [
    {
      rank: 1,
      vendor: 'OpenAI',
      total_tokens: 1234567,
      share: 0.5,
      growth_pct: 3,
      models_count: 4,
      top_model: 'gpt-4o',
    },
  ],
  top_movers: [
    {
      model_name: 'gpt-4o',
      vendor: 'OpenAI',
      rank_delta: 3,
      current_rank: 1,
      growth_pct: 20,
    },
  ],
  top_droppers: [
    {
      model_name: 'old-model',
      vendor: 'X',
      rank_delta: -2,
      current_rank: 8,
      growth_pct: -11,
    },
  ],
  models_history: { points: [], models: [], buckets: 6 },
  vendor_share_history: { points: [], vendors: [], buckets: 6 },
};

describe('rankings service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes period to the backend-accepted values', () => {
    // controller/rankings.go 只接受 today/week/month/year（其余 400），
    // 新版前端在路由层用 zod .catch 回落到默认值。
    expect(normalizeRankingPeriod('today')).toBe('today');
    expect(normalizeRankingPeriod('month')).toBe('month');
    expect(normalizeRankingPeriod('year')).toBe('year');
    expect(normalizeRankingPeriod(undefined)).toBe('week');
    expect(normalizeRankingPeriod('bogus')).toBe('week');
    expect(RANKING_PERIODS.map((p) => p.value)).toEqual([
      'today',
      'week',
      'month',
      'year',
    ]);
  });

  it('GETs /api/rankings with period param and unwraps data', async () => {
    API.get.mockResolvedValue({ data: { success: true, data: SNAPSHOT } });

    const snapshot = await getRankings('month');

    expect(API.get).toHaveBeenCalledWith('/api/rankings', {
      params: { period: 'month' },
    });
    expect(snapshot).toEqual(SNAPSHOT);
  });

  it('rejects with backend message when success=false', async () => {
    API.get.mockResolvedValue({
      data: { success: false, message: 'invalid period' },
    });
    await expect(getRankings('bogus')).rejects.toThrow('invalid period');
  });

  it('formats share as percentage of 0..1', () => {
    expect(formatSharePct(0.421)).toBe('42.1%');
    expect(formatSharePct(0)).toBe('0.0%');
    expect(formatSharePct(undefined)).toBe('-');
    expect(formatSharePct(-1)).toBe('-');
  });

  it('formats growth with explicit sign', () => {
    expect(formatGrowthPct(12.4)).toBe('+12%');
    expect(formatGrowthPct(-5)).toBe('-5%');
    expect(formatGrowthPct(0)).toBe('0%');
    expect(formatGrowthPct('x')).toBe('-');
  });

  it('abbreviates token counts', () => {
    expect(formatTokenCount(1234567)).toBe('1.23M');
    expect(formatTokenCount(12345)).toBe('12.3K');
    expect(formatTokenCount(1234567890)).toBe('1.23B');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(undefined)).toBe('-');
  });

  it('builds model rows with rank display and new-arrival flag', () => {
    const rows = buildModelRows(SNAPSHOT.models);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: 'gpt-4o',
      display_rank: '#1',
      model_name: 'gpt-4o',
      vendor: 'OpenAI',
      total_tokens_label: '1.23M',
      share_label: '42.0%',
      growth_label: '+12%',
      is_new: false,
    });
    // previous_rank 缺失 → 新上榜
    expect(rows[1].is_new).toBe(true);
    expect(buildModelRows(null)).toEqual([]);
  });

  it('builds vendor and mover rows', () => {
    const vendorRows = buildVendorRows(SNAPSHOT.vendors);
    expect(vendorRows[0]).toMatchObject({
      vendor: 'OpenAI',
      models_count: 4,
      top_model: 'gpt-4o',
      share_label: '50.0%',
    });

    const moverRows = buildMoverRows(SNAPSHOT.top_movers);
    expect(moverRows[0]).toMatchObject({
      model_name: 'gpt-4o',
      rank_delta: 3,
      current_rank: 1,
      growth_label: '+20%',
    });
    expect(buildMoverRows(undefined)).toEqual([]);
  });
});
