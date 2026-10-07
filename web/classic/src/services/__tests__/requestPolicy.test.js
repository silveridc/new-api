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
    patch: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  CHANNEL_TEST_MODES,
  MAX_CHANNEL_TEST_CONCURRENCY,
  SESSION_MODE_OPTIONS,
  RULE_SESSION_MODE_OPTIONS,
  isRequestPolicyOptionKey,
  partitionOptionChanges,
  saveRequestPolicyOptions,
  getRequestPolicyOptions,
  normalizeChannelTestConcurrency,
  isChannelTestMode,
  isRuleSessionMode,
  isGlobalSessionMode,
} from '../requestPolicy';

describe('requestPolicy service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mirrors backend IsRequestPolicyOption key set', () => {
    // model/request_policy.go:74-90
    expect(isRequestPolicyOptionKey('channel_affinity_setting.rules')).toBe(
      true,
    );
    expect(
      isRequestPolicyOptionKey('channel_affinity_setting.session_mode'),
    ).toBe(true);
    expect(
      isRequestPolicyOptionKey(
        'channel_affinity_setting.keep_on_channel_disabled',
      ),
    ).toBe(true);
    expect(isRequestPolicyOptionKey('monitor_setting.channel_test_mode')).toBe(
      true,
    );
    expect(
      isRequestPolicyOptionKey('monitor_setting.channel_test_concurrency'),
    ).toBe(true);
    expect(isRequestPolicyOptionKey('AutomaticRetryStatusCodes')).toBe(true);
    // 非策略 key：继续走 PUT /api/option/
    expect(isRequestPolicyOptionKey('QuotaRemindThreshold')).toBe(false);
    expect(isRequestPolicyOptionKey('ChannelDisableThreshold')).toBe(true);
    expect(isRequestPolicyOptionKey(null)).toBe(false);
  });

  it('splits changed keys into policy (PATCH) and legacy (PUT) groups', () => {
    const { policy, legacy } = partitionOptionChanges({
      'channel_affinity_setting.enabled': 'true',
      'monitor_setting.channel_test_concurrency': '4',
      QuotaRemindThreshold: '1000',
    });
    expect(policy).toEqual({
      'channel_affinity_setting.enabled': 'true',
      'monitor_setting.channel_test_concurrency': '4',
    });
    expect(legacy).toEqual({ QuotaRemindThreshold: '1000' });
  });

  it('PATCHes /api/option/request_policy with options map', async () => {
    // controller/request_policy.go:14-27：请求体 { options }，成功回传 GET 响应。
    const options = { 'channel_affinity_setting.session_mode': 'strict' };
    API.patch.mockResolvedValue({
      data: {
        success: true,
        data: { options: { ...options, RetryTimes: '3' } },
      },
    });

    const result = await saveRequestPolicyOptions(options);

    expect(API.patch).toHaveBeenCalledWith('/api/option/request_policy', {
      options,
    });
    expect(result).toEqual({
      'channel_affinity_setting.session_mode': 'strict',
      RetryTimes: '3',
    });
  });

  it('throws backend validation message from PATCH', async () => {
    // model/request_policy.go:181 invalid global session mode → 400
    API.patch.mockResolvedValue({
      data: { success: false, message: 'invalid global session mode' },
    });
    await expect(
      saveRequestPolicyOptions({ 'channel_affinity_setting.session_mode': 'x' }),
    ).rejects.toThrow('invalid global session mode');
  });

  it('GETs /api/option/request_policy options', async () => {
    API.get.mockResolvedValue({
      data: {
        success: true,
        data: { options: { 'channel_affinity_setting.enabled': 'true' } },
      },
    });
    await expect(getRequestPolicyOptions()).resolves.toEqual({
      'channel_affinity_setting.enabled': 'true',
    });
    expect(API.get).toHaveBeenCalledWith('/api/option/request_policy');
  });

  it('validates channel test concurrency range 1..32', () => {
    expect(MAX_CHANNEL_TEST_CONCURRENCY).toBe(32);
    expect(normalizeChannelTestConcurrency(0)).toBe(1);
    expect(normalizeChannelTestConcurrency(99)).toBe(32);
    expect(normalizeChannelTestConcurrency('4')).toBe(4);
    expect(normalizeChannelTestConcurrency(2.9)).toBe(2);
  });

  it('validates channel test modes and session modes', () => {
    // setting/operation_setting/monitor_setting.go:17-19
    expect(CHANNEL_TEST_MODES.map((m) => m.value)).toEqual([
      'scheduled_all',
      'auto_ban_only',
      'passive_recovery',
    ]);
    expect(isChannelTestMode('scheduled_all')).toBe(true);
    expect(isChannelTestMode('other')).toBe(false);

    // model/request_policy.go:181-189
    expect(SESSION_MODE_OPTIONS.map((o) => o.value)).toEqual([
      'off',
      'prefer',
      'strict',
    ]);
    expect(isGlobalSessionMode('')).toBe(true);
    expect(isGlobalSessionMode('strict')).toBe(true);
    expect(isGlobalSessionMode('inherit')).toBe(false);
    expect(RULE_SESSION_MODE_OPTIONS.map((o) => o.value)).toEqual([
      'inherit',
      'off',
      'prefer',
      'strict',
    ]);
    expect(isRuleSessionMode('inherit')).toBe(true);
    expect(isRuleSessionMode('bogus')).toBe(false);
  });
});
