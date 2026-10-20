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
 * 性能页服务。契约来源：
 * - 新版前端 web/src/features/performance-metrics/api.ts / types.ts
 * - 后端 router/api-router.go:246-254 /api/performance 组（RootAuth）
 * - 后端 controller/perf_metrics.go:14-77 /api/perf-metrics 与 /api/perf-metrics/summary
 *   （HeaderNavModulePublicOrUserAuth("pricing")，query: hours，非法忽略取默认 24）
 * - 后端 controller/performance.go:22-61 PerformanceStats 结构。
 *
 * GET /api/perf-metrics/summary?hours=N
 *   data: { summary?: { avg_latency_ms, success_rate, avg_tps } | null,
 *           window_start?, window_end?,
 *           models: [{ model_name, avg_latency_ms, success_rate, avg_tps,
 *                      recent_success_series?, request_count? }] }
 *
 * GET /api/perf-metrics?model=X&hours=N[&group=G]（controller/perf_metrics.go:44-79）
 *   data: { model_name, series_schema,
 *           summary?: { avg_latency_ms, success_rate, avg_tps } | null,
 *           series: [{ ts, avg_ttft_ms, avg_latency_ms, success_rate, avg_tps }],
 *           window_start, window_end,
 *           groups: [{ group, avg_ttft_ms, avg_latency_ms, success_rate, avg_tps,
 *                      series: [...] }] }
 *   注意：所有 success_rate 均为 0..100 百分数。
 *
 * GET /api/performance/stats（Root）
 *   data: { cache_stats, memory_stats: { alloc, total_alloc, sys, num_gc, num_goroutine },
 *           disk_cache_info: { path, exists, file_count, total_size },
 *           disk_space_info: { used_percent },
 *           config: { disk_cache_enabled, disk_cache_threshold_mb, disk_cache_max_size_mb,
 *                     disk_cache_path, is_running_in_container, monitor_enabled,
 *                     monitor_cpu_threshold, monitor_memory_threshold, monitor_disk_threshold } }
 */

export const PERF_HOURS_OPTIONS = [
  { value: 1, label: '近 1 小时' },
  { value: 6, label: '近 6 小时' },
  { value: 24, label: '近 24 小时' },
  { value: 72, label: '近 3 天' },
  { value: 168, label: '近 7 天' },
];

export const DEFAULT_PERF_HOURS = 24;

export function normalizePerfHours(hours) {
  const n = Number(hours);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_PERF_HOURS;
}

/**
 * 模型性能汇总。返回解包后的 data。
 */
export async function getPerfSummary(hours) {
  const res = await API.get('/api/perf-metrics/summary', {
    params: { hours: normalizePerfHours(hours) },
  });
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '获取模型性能数据失败');
  }
  return data || null;
}

/**
 * 单个模型的性能明细（分分组 + 时间序列）。返回解包后的 data。
 * group 为空表示全部允许分组的汇总。
 */
export async function getPerfMetrics(modelName, hours, group) {
  const params = { hours: normalizePerfHours(hours) };
  const g = typeof group === 'string' ? group.trim() : '';
  if (g) {
    params.group = g;
  }
  const res = await API.get('/api/perf-metrics', {
    params: { ...params, model: modelName },
  });
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '获取模型性能数据失败');
  }
  return data || null;
}

/**
 * 系统性能统计（Root）。返回解包后的 data。
 */
export async function getPerformanceStats() {
  const res = await API.get('/api/performance/stats');
  const { success, message, data } = res.data || {};
  if (!success) {
    throw new Error(message || '获取系统性能数据失败');
  }
  return data || null;
}

/**
 * 清理不活跃磁盘缓存（Root）。
 */
export async function clearDiskCache() {
  const res = await API.delete('/api/performance/disk_cache');
  const { success, message } = res.data || {};
  if (!success) {
    throw new Error(message || '清理磁盘缓存失败');
  }
  return message;
}

/**
 * 重置性能统计（Root）。
 */
export async function resetPerformanceStats() {
  const res = await API.post('/api/performance/reset_stats');
  const { success, message } = res.data || {};
  if (!success) {
    throw new Error(message || '重置统计失败');
  }
  return message;
}

/**
 * 强制执行 GC（Root）。
 */
export async function forceGC() {
  const res = await API.post('/api/performance/gc');
  const { success, message } = res.data || {};
  if (!success) {
    throw new Error(message || '执行 GC 失败');
  }
  return message;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

/**
 * success_rate 后端已是 0..100 的百分数（pkg/perf_metrics successRate() 乘 100，
 * summary 再 round 到两位），这里只做展示格式化，不要再乘 100。
 */
export function formatSuccessRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(2)}%`;
}

export function formatLatency(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '-';
  return `${Math.round(n)} ms`;
}

export function formatTps(tps) {
  const n = Number(tps);
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(2);
}

/**
 * 模型性能表数据源。
 */
export function buildPerfModelRows(models) {
  return (Array.isArray(models) ? models : []).map((m, index) => ({
    key: m?.model_name || `model-${index}`,
    model_name: m?.model_name || '-',
    avg_latency_ms: Number(m?.avg_latency_ms || 0),
    latency_label: formatLatency(m?.avg_latency_ms),
    success_rate: Number(m?.success_rate || 0),
    success_rate_label: formatSuccessRate(m?.success_rate),
    avg_tps: Number(m?.avg_tps || 0),
    tps_label: formatTps(m?.avg_tps),
    request_count: Number(m?.request_count || 0),
  }));
}

/**
 * 可用性迷你柱图（sparkline）数据与样式。阈值/配色对齐新版
 * web/src/features/performance-metrics/lib/format.ts 与
 * web/src/features/pricing/components/model-perf-badge.tsx。
 */
export const AVAILABILITY_SAMPLE_LIMIT = 24;

export function successRateLevel(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 'unknown';
  if (n >= 100) return 'excellent';
  if (n >= 90) return 'good';
  if (n >= 70) return 'warning';
  return 'critical';
}

const SUCCESS_RATE_COLOR = {
  excellent: '#10b981',
  good: '#34d399',
  warning: '#f59e0b',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

export function successRateColor(rate) {
  return SUCCESS_RATE_COLOR[successRateLevel(rate)];
}

// 越差的小时柱子越矮，便于扫视异常时段。
export function availabilityBarHeight(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 40;
  if (n >= 99.9) return 100;
  if (n >= 99) return 88;
  if (n >= 95) return 72;
  if (n >= 90) return 55;
  return 40;
}

/**
 * 把 { ts, success_rate } 序列整理成 sparkline 采样点：丢弃缺字段的点，
 * 按时间升序，只保留最近 limit 个小时（与新版 model-perf-badge.tsx 一致）。
 */
export function buildAvailabilityPoints(series, limit = AVAILABILITY_SAMPLE_LIMIT) {
  return (Array.isArray(series) ? series : [])
    .filter((point) => {
      const ts = Number(point?.ts);
      const rate = Number(point?.success_rate);
      return (
        Number.isFinite(ts) &&
        Number.isFinite(rate) &&
        rate >= 0 &&
        rate <= 100
      );
    })
    .map((point) => ({ ts: Number(point.ts), rate: Number(point.success_rate) }))
    .sort((a, b) => a.ts - b.ts)
    .slice(-limit);
}

/**
 * bucket_time 可为 minute/5min/hour（setting/perf_metrics_setting/config.go:27-38），
 * 最细到分钟，因此 HH:mm 在同一窗口内不会重复，可直接作为类目轴的刻度。
 */
export function formatPerfTimeLabel(ts) {
  const date = new Date(Number(ts) * 1000);
  if (!Number.isFinite(date.getTime())) return '-';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 接口已按 hours 开窗，这里只是 bucket_time=minute 时的点数安全阀。
export const LATENCY_POINT_LIMIT = 240;

/**
 * 延迟趋势折线数据点。丢弃 avg_ttft_ms <= 0 的桶（非流式请求不记录 TTFT），
 * 规则对齐新版 web/src/features/pricing/components/model-details-performance.tsx
 * 的 toLatencySeries()。
 */
export function buildLatencyPoints(series, limit = LATENCY_POINT_LIMIT) {
  return (Array.isArray(series) ? series : [])
    .filter((point) => {
      const ts = Number(point?.ts);
      const ttft = Number(point?.avg_ttft_ms);
      return Number.isFinite(ts) && Number.isFinite(ttft) && ttft > 0;
    })
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .slice(-limit)
    .map((point) => ({
      label: formatPerfTimeLabel(point.ts),
      ttft: Number(point.avg_ttft_ms),
    }));
}
