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
 * 排行榜服务。契约来源：
 * - 新版前端 web/src/features/rankings/api.ts / types.ts
 * - 后端 router/api-router.go:45 GET /api/rankings（HeaderNavModuleAuth("rankings")）
 * - 后端 controller/rankings.go:10（query: period，默认 week，非法 period 返回 400）
 * - 后端 service/rankings.go:13-120 RankingsResponse 结构。
 *
 * 响应 data 结构：
 * {
 *   models: [{ rank, previous_rank?, model_name, vendor, vendor_icon?, category,
 *              total_tokens, share, growth_pct }],
 *   vendors: [{ rank, vendor, vendor_icon?, total_tokens, share, growth_pct,
 *               models_count, top_model }],
 *   top_movers:  [{ model_name, vendor, vendor_icon?, rank_delta, current_rank, growth_pct }],
 *   top_droppers: 同 top_movers,
 *   models_history:       { points, models, buckets },
 *   vendor_share_history: { points, vendors, buckets },
 * }
 */

export const RANKING_PERIODS = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '今年' },
];

export const DEFAULT_RANKING_PERIOD = 'week';

/**
 * 规范化 period 参数；非法值回落到 week（与新版路由 zod .catch 行为一致）。
 */
export function normalizeRankingPeriod(period) {
  return RANKING_PERIODS.some((p) => p.value === period)
    ? period
    : DEFAULT_RANKING_PERIOD;
}

/**
 * GET /api/rankings?period=xxx。返回解包后的 data（RankingsSnapshot）。
 * 后端 success=false 时抛错（携带后端 message）。
 */
export async function getRankings(period) {
  const res = await API.get('/api/rankings', {
    params: { period: normalizeRankingPeriod(period) },
  });
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '获取排行榜数据失败');
  }
  return data || null;
}

/**
 * share 是 0..1 的比例，按百分比展示；非法值返回 '-'。
 */
export function formatSharePct(share) {
  const n = Number(share);
  if (!Number.isFinite(n) || n < 0) return '-';
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * 增长百分比展示：正数带 +，无小数；非法值返回 '-'。
 */
export function formatGrowthPct(growth) {
  const n = Number(growth);
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n);
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

/**
 * token 数量缩写展示（K/M/B），非法值返回 '-'。
 */
export function formatTokenCount(tokens) {
  const n = Number(tokens);
  if (!Number.isFinite(n) || n < 0) return '-';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

/**
 * 模型排行表数据源。rank 展示为 "#N"；previous_rank 缺失表示"新上榜"。
 */
export function buildModelRows(models) {
  return (Array.isArray(models) ? models : []).map((m, index) => ({
    key: m?.model_name || `model-${index}`,
    rank: m?.rank ?? index + 1,
    display_rank: `#${m?.rank ?? index + 1}`,
    model_name: m?.model_name || '-',
    vendor: m?.vendor || '-',
    category: m?.category || '-',
    total_tokens: Number(m?.total_tokens || 0),
    total_tokens_label: formatTokenCount(m?.total_tokens),
    share: Number(m?.share || 0),
    share_label: formatSharePct(m?.share),
    growth_pct: Number(m?.growth_pct || 0),
    growth_label: formatGrowthPct(m?.growth_pct),
    is_new: m?.previous_rank === undefined || m?.previous_rank === null,
  }));
}

/**
 * 厂商排行表数据源。
 */
export function buildVendorRows(vendors) {
  return (Array.isArray(vendors) ? vendors : []).map((v, index) => ({
    key: v?.vendor || `vendor-${index}`,
    rank: v?.rank ?? index + 1,
    display_rank: `#${v?.rank ?? index + 1}`,
    vendor: v?.vendor || '-',
    models_count: Number(v?.models_count || 0),
    top_model: v?.top_model || '-',
    total_tokens: Number(v?.total_tokens || 0),
    total_tokens_label: formatTokenCount(v?.total_tokens),
    share: Number(v?.share || 0),
    share_label: formatSharePct(v?.share),
    growth_pct: Number(v?.growth_pct || 0),
    growth_label: formatGrowthPct(v?.growth_pct),
  }));
}

/**
 * 涨跌幅表数据源。movers（上升）与 droppers（下降）共用结构。
 */
export function buildMoverRows(list) {
  return (Array.isArray(list) ? list : []).map((m, index) => ({
    key: m?.model_name || `mover-${index}`,
    model_name: m?.model_name || '-',
    vendor: m?.vendor || '-',
    current_rank: Number(m?.current_rank || 0),
    rank_delta: Number(m?.rank_delta || 0),
    growth_pct: Number(m?.growth_pct || 0),
    growth_label: formatGrowthPct(m?.growth_pct),
  }));
}
