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
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  PERF_HOURS_OPTIONS,
  AVAILABILITY_SAMPLE_LIMIT,
  normalizePerfHours,
  getPerfSummary,
  getPerfMetrics,
  getPerformanceStats,
  clearDiskCache,
  resetPerformanceStats,
  forceGC,
  formatBytes,
  formatSuccessRate,
  formatLatency,
  formatTps,
  buildPerfModelRows,
  buildAvailabilityPoints,
  buildLatencyPoints,
  formatPerfTimeLabel,
  LATENCY_POINT_LIMIT,
  successRateLevel,
  availabilityBarHeight,
  successRateColor,
} from '../performance';

describe('performance service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes hours to a positive integer, default 24', () => {
    expect(normalizePerfHours(24)).toBe(24);
    expect(normalizePerfHours('6')).toBe(6);
    expect(normalizePerfHours(0)).toBe(24);
    expect(normalizePerfHours(-3)).toBe(24);
    expect(normalizePerfHours(undefined)).toBe(24);
    expect(PERF_HOURS_OPTIONS.map((o) => o.value)).toEqual([1, 6, 24, 72, 168]);
  });

  it('GETs /api/perf-metrics/summary with hours and unwraps data', async () => {
    // 后端 controller/perf_metrics.go:14-34（RootAuth 无需，
    // HeaderNavModulePublicOrUserAuth("pricing")），QuerySummaryAll 结果结构。
    // success_rate 为 0..100 百分数（pkg/perf_metrics/metrics.go successRate）。
    const payload = {
      summary: { avg_latency_ms: 812, success_rate: 99.42, avg_tps: 33.5 },
      window_start: 1,
      window_end: 2,
      models: [
        {
          model_name: 'gpt-4o',
          avg_latency_ms: 700,
          success_rate: 99,
          avg_tps: 40,
        },
      ],
    };
    API.get.mockResolvedValue({ data: { success: true, data: payload } });

    const data = await getPerfSummary(6);

    expect(API.get).toHaveBeenCalledWith('/api/perf-metrics/summary', {
      params: { hours: 6 },
    });
    expect(data).toEqual(payload);
    expect(data.summary.avg_latency_ms).toBe(812);
  });

  it('surfaces backend errors from perf summary', async () => {
    API.get.mockResolvedValue({ data: { success: false, message: 'boom' } });
    await expect(getPerfSummary(24)).rejects.toThrow('boom');
  });

  it('GETs /api/performance/stats (RootAuth route)', async () => {
    // 后端 controller/performance.go:22-61 PerformanceStats JSON 结构。
    const stats = {
      cache_stats: {},
      memory_stats: {
        alloc: 1,
        total_alloc: 2,
        sys: 3,
        num_gc: 4,
        num_goroutine: 5,
      },
      disk_cache_info: {
        path: '/tmp/cache',
        exists: true,
        file_count: 2,
        total_size: 2048,
      },
      disk_space_info: { used_percent: 55.5 },
      config: {
        disk_cache_enabled: true,
        disk_cache_threshold_mb: 10,
        disk_cache_max_size_mb: 100,
        disk_cache_path: '/tmp/cache',
        is_running_in_container: false,
        monitor_enabled: true,
        monitor_cpu_threshold: 80,
        monitor_memory_threshold: 85,
        monitor_disk_threshold: 90,
      },
    };
    API.get.mockResolvedValue({ data: { success: true, data: stats } });

    await expect(getPerformanceStats()).resolves.toEqual(stats);
    expect(API.get).toHaveBeenCalledWith('/api/performance/stats');
  });

  it('issues Root maintenance actions to the /api/performance group', async () => {
    // router/api-router.go:248-253
    API.delete.mockResolvedValue({
      data: { success: true, message: '不活跃的磁盘缓存已清理' },
    });
    API.post.mockResolvedValue({ data: { success: true, message: 'GC 已执行' } });

    await expect(clearDiskCache()).resolves.toBe('不活跃的磁盘缓存已清理');
    expect(API.delete).toHaveBeenCalledWith('/api/performance/disk_cache');

    await resetPerformanceStats();
    expect(API.post).toHaveBeenCalledWith('/api/performance/reset_stats');

    await forceGC();
    expect(API.post).toHaveBeenCalledWith('/api/performance/gc');

    API.post.mockResolvedValue({ data: { success: false, message: 'no' } });
    await expect(forceGC()).rejects.toThrow('no');
  });

  it('formats bytes, rates, latency and tps', () => {
    expect(formatBytes(2048)).toBe('2.00 KB');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('-');
    expect(formatSuccessRate(99.42)).toBe('99.42%');
    expect(formatSuccessRate(0)).toBe('0.00%');
    expect(formatSuccessRate(100)).toBe('100.00%');
    expect(formatSuccessRate(undefined)).toBe('-');
    expect(formatLatency(812.6)).toBe('813 ms');
    expect(formatLatency(undefined)).toBe('-');
    expect(formatTps(33.456)).toBe('33.46');
    expect(formatTps(undefined)).toBe('-');
  });

  it('builds model perf rows', () => {
    const rows = buildPerfModelRows([
      {
        model_name: 'gpt-4o',
        avg_latency_ms: 700,
        success_rate: 99,
        avg_tps: 40,
        request_count: 123,
      },
    ]);
    expect(rows[0]).toMatchObject({
      key: 'gpt-4o',
      latency_label: '700 ms',
      success_rate_label: '99.00%',
      tps_label: '40.00',
      request_count: 123,
    });
    expect(buildPerfModelRows(undefined)).toEqual([]);
  });

  it('GETs /api/perf-metrics for one model and omits an empty group filter', async () => {
    // 后端 controller/perf_metrics.go:44-79：model 必填，group 为空即不限分组。
    const payload = {
      model_name: 'gpt-4o',
      summary: { avg_latency_ms: 700, success_rate: 99.01, avg_tps: 40 },
      series: [{ ts: 1, success_rate: 99.01 }],
      groups: [],
    };
    API.get.mockResolvedValue({ data: { success: true, data: payload } });

    await expect(getPerfMetrics('gpt-4o')).resolves.toEqual(payload);
    expect(API.get).toHaveBeenCalledWith('/api/perf-metrics', {
      params: { hours: 24, model: 'gpt-4o' },
    });

    await getPerfMetrics('gpt-4o', 6, '  ');
    expect(API.get).toHaveBeenLastCalledWith('/api/perf-metrics', {
      params: { hours: 6, model: 'gpt-4o' },
    });

    await getPerfMetrics('gpt-4o', 6, 'vip');
    expect(API.get).toHaveBeenLastCalledWith('/api/perf-metrics', {
      params: { hours: 6, model: 'gpt-4o', group: 'vip' },
    });

    API.get.mockResolvedValue({ data: { success: false, message: 'boom' } });
    await expect(getPerfMetrics('gpt-4o')).rejects.toThrow('boom');
  });

  it('builds sparkline samples in ascending time order and keeps the latest hours', () => {
    const points = buildAvailabilityPoints([
      { ts: 3, success_rate: 100 },
      { ts: 1, success_rate: 98.5 },
      { ts: 2, success_rate: undefined },
      { ts: 2, success_rate: 101 },
      null,
    ]);
    expect(points).toEqual([
      { ts: 1, rate: 98.5 },
      { ts: 3, rate: 100 },
    ]);

    const many = Array.from({ length: 30 }, (_, i) => ({
      ts: i + 1,
      success_rate: 100,
    }));
    const limited = buildAvailabilityPoints(many);
    expect(limited).toHaveLength(AVAILABILITY_SAMPLE_LIMIT);
    expect(limited[0].ts).toBe(30 - AVAILABILITY_SAMPLE_LIMIT + 1);
    expect(buildAvailabilityPoints(undefined)).toEqual([]);
  });

  it('formats perf bucket times as local HH:mm', () => {
    const localTs = (hour, minute) =>
      new Date(2026, 9, 20, hour, minute, 0).getTime() / 1000;
    expect(formatPerfTimeLabel(localTs(9, 5))).toBe('09:05');
    expect(formatPerfTimeLabel(localTs(14, 0))).toBe('14:00');
    expect(formatPerfTimeLabel('not-a-number')).toBe('-');
  });

  it('keeps only buckets with a first-token latency, oldest first', () => {
    const at = (hour) => new Date(2026, 9, 20, hour, 0, 0).getTime() / 1000;
    expect(
      buildLatencyPoints([
        { ts: at(13), avg_ttft_ms: 30 },
        { ts: at(11), avg_ttft_ms: 10 },
        { ts: at(12), avg_ttft_ms: 0 },
        { ts: at(14), avg_ttft_ms: null },
        { ts: at(15), avg_ttft_ms: 50 },
      ]),
    ).toEqual([
      { label: '11:00', ttft: 10 },
      { label: '13:00', ttft: 30 },
      { label: '15:00', ttft: 50 },
    ]);
    expect(buildLatencyPoints(undefined)).toEqual([]);

    const many = Array.from({ length: 300 }, (_, i) => ({
      ts: at(0) + i * 60,
      avg_ttft_ms: i + 1,
    }));
    const limited = buildLatencyPoints(many);
    expect(limited).toHaveLength(LATENCY_POINT_LIMIT);
    expect(limited[0].ttft).toBe(300 - LATENCY_POINT_LIMIT + 1);
    expect(limited[limited.length - 1].ttft).toBe(300);
  });

  it('grades success rates with the same thresholds and colors as the new UI', () => {
    expect(successRateLevel(100)).toBe('excellent');
    expect(successRateLevel(99.99)).toBe('good');
    expect(successRateLevel(90)).toBe('good');
    expect(successRateLevel(89.9)).toBe('warning');
    expect(successRateLevel(70)).toBe('warning');
    expect(successRateLevel(69.9)).toBe('critical');
    expect(successRateLevel(undefined)).toBe('unknown');
    expect(successRateColor(100)).toBe('#10b981');
    expect(successRateColor(69.9)).toBe('#ef4444');

    expect(availabilityBarHeight(100)).toBe(100);
    expect(availabilityBarHeight(99.5)).toBe(88);
    expect(availabilityBarHeight(96)).toBe(72);
    expect(availabilityBarHeight(92)).toBe(55);
    expect(availabilityBarHeight(50)).toBe(40);
    expect(availabilityBarHeight(undefined)).toBe(40);
  });
});
