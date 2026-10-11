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
    vendor_icon: m?.vendor_icon || '',
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
    vendor_icon: v?.vendor_icon || '',
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
    vendor_icon: m?.vendor_icon || '',
    current_rank: Number(m?.current_rank || 0),
    rank_delta: Number(m?.rank_delta || 0),
    growth_pct: Number(m?.growth_pct || 0),
    growth_label: formatGrowthPct(m?.growth_pct),
  }));
}

/**
 * 图表系列上限。系列过多会互相挤压、图例不可读，只保留 total 最高的前 N 个
 * （models/vendors 已按 total 降序返回）。
 */
export const MAX_TREND_SERIES = 8;

/**
 * 按 ts 升序、同 ts 内按 seriesOrder 顺序排列，保证堆叠自底向上与图例顺序一致。
 * x 轴类别顺序由数据首次出现顺序决定，因此必须排序而不是原样透传。
 */
function sortByTsThenOrder(points, seriesField, order) {
  return [...points].sort((a, b) => {
    const tsCmp = String(a?.ts ?? '').localeCompare(String(b?.ts ?? ''));
    if (tsCmp !== 0) return tsCmp;
    return (
      (order.get(a?.[seriesField]) ?? 999) -
      (order.get(b?.[seriesField]) ?? 999)
    );
  });
}

/**
 * models_history -> 堆叠柱数据。只保留 models 前 N 个模型，字段：label/model/tokens。
 */
export function buildModelHistoryValues(history, limit = MAX_TREND_SERIES) {
  const points = Array.isArray(history?.points) ? history.points : [];
  const models = Array.isArray(history?.models) ? history.models : [];
  if (!points.length || !models.length) return [];

  const top = models.slice(0, limit).filter((m) => m?.name);
  const order = new Map(top.map((m, index) => [m.name, index]));
  const kept = points
    .filter((p) => order.has(p?.model))
    .map((p) => ({
      ts: p?.ts ?? '',
      label: p?.label ?? '',
      model: p?.model,
      tokens: Number(p?.tokens) || 0,
    }));

  return sortByTsThenOrder(kept, 'model', order);
}

/**
 * vendor_share_history -> 100% 堆叠面积图数据。只保留 vendors 前 N 个厂商，
 * 字段：label/vendor/share/tokens。
 */
export function buildVendorShareValues(history, limit = MAX_TREND_SERIES) {
  const points = Array.isArray(history?.points) ? history.points : [];
  const vendors = Array.isArray(history?.vendors) ? history.vendors : [];
  if (!points.length || !vendors.length) return [];

  const top = vendors.slice(0, limit).filter((v) => v?.name);
  const order = new Map(top.map((v, index) => [v.name, index]));
  const kept = points
    .filter((p) => order.has(p?.vendor))
    .map((p) => ({
      ts: p?.ts ?? '',
      label: p?.label ?? '',
      vendor: p?.vendor,
      share: Number(p?.share) || 0,
      tokens: Number(p?.tokens) || 0,
    }));

  return sortByTsThenOrder(kept, 'vendor', order);
}
