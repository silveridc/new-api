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
 * success_rate 后端为 0..1 比例（QuerySummaryAll 聚合值）。
 */
export function formatSuccessRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(2)}%`;
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
