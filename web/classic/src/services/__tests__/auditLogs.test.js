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
*/

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { API } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  buildAuditQueryParams,
  getAuditLogs,
  buildAuditDetails,
  describeAuditTaskPlugin,
  auditRoleName,
} from '../auditLogs';

describe('auditLogs service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildAuditQueryParams keeps pagination and drops empty filters', () => {
    expect(buildAuditQueryParams()).toEqual({ p: 1, page_size: 20 });
    expect(
      buildAuditQueryParams({
        p: 3,
        page_size: 50,
        start_timestamp: 100,
        end_timestamp: 200,
        success: 'true',
        category: 'login',
        username: 'alice',
        token_ref: 'fp',
        request_id: 'req-1',
        exclude_token_ref: '',
      }),
    ).toEqual({
      p: 3,
      page_size: 50,
      start_timestamp: 100,
      end_timestamp: 200,
      success: 'true',
      category: 'login',
      username: 'alice',
      token_ref: 'fp',
      request_id: 'req-1',
    });
    // success 为 'all' 时不发送
    expect(buildAuditQueryParams({ success: 'all', category: 'all' })).toEqual({
      p: 1,
      page_size: 20,
    });
  });

  it('getAuditLogs GETs /api/audit for scope=all and unwraps PageInfo', async () => {
    API.get.mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          page: 1,
          page_size: 20,
          total: 2,
          items: [{ event_id: 'e1' }, { event_id: 'e2' }],
        },
      },
    });
    const result = await getAuditLogs('all', { p: 1, page_size: 20 });
    expect(API.get).toHaveBeenCalledWith('/api/audit', {
      params: { p: 1, page_size: 20 },
    });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('getAuditLogs GETs /api/audit/self for scope=self', async () => {
    API.get.mockResolvedValue({
      data: { success: true, message: '', data: { items: [], total: 0 } },
    });
    await getAuditLogs('self', { p: 2, page_size: 10 });
    expect(API.get).toHaveBeenCalledWith('/api/audit/self', {
      params: { p: 2, page_size: 10 },
    });
  });

  it('getAuditLogs throws on business failure', async () => {
    API.get.mockResolvedValue({
      data: { success: false, message: 'denied' },
    });
    await expect(getAuditLogs('all', {})).rejects.toThrowError('denied');
  });

  it('getAuditLogs wraps HTTP 403 rejections with status for scope fallback', async () => {
    const httpError = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403, data: { success: false, message: 'forbidden' } },
    });
    API.get.mockRejectedValue(httpError);
    let caught;
    try {
      await getAuditLogs('all', {});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('forbidden');
    expect(caught.status).toBe(403);
  });

  it('buildAuditDetails splits other into op/admin/audit_info/extra', () => {
    const entry = {
      username: 'root',
      user_id: 1,
      actor_role: 100,
      content: '更新了渠道',
      other: {
        op: { action: 'channel.update', params: { id: 5, status: 1 } },
        admin_info: {
          admin_id: 1,
          admin_username: 'root',
          admin_role: 100,
          auth_method: 'session',
          request_policy: [{ policy: 'default', decision: 'allow' }],
          quota_saturation: { original: 100, clamped: 50, op: 'pre_consume' },
          task_plugin: { key: 'suno', name: 'Suno', version: '1.0' },
        },
        audit_info: { method: 'PUT', route: '/api/channel/', status: 200, success: true },
        login_method: 'password',
      },
    };
    const detail = buildAuditDetails(entry);
    expect(detail.action).toBe('channel.update');
    expect(detail.summary).toBe('更新了渠道');
    expect(detail.actor).toBe('root (ID: 1)');
    expect(detail.actorRole).toBe('超级管理员');
    expect(detail.authentication).toBe('session');
    expect(detail.paramsFields).toEqual([{ label: 'status', value: 1 }]);
    expect(detail.auditInfo).toMatchObject({ method: 'PUT', status: 200 });
    expect(detail.extra.admin_info.request_policy).toEqual([
      { policy: 'default', decision: 'allow' },
    ]);
    expect(detail.extra.admin_info.quota_saturation).toEqual({
      original: 100,
      clamped: 50,
      op: 'pre_consume',
    });
    expect(detail.extra.login_method).toBe('password');
    expect(detail.metadataUnavailable).toBe(false);
  });

  it('buildAuditDetails flags metadata-unavailable entries', () => {
    const detail = buildAuditDetails({ username: 'u', other: null });
    expect(detail.metadataUnavailable).toBe(true);
    expect(detail.actor).toBe('u');
  });

  it('describeAuditTaskPlugin reads plugin platform info from other', () => {
    const entry = {
      other: {
        admin_info: {
          task_plugin: { key: 'suno', name: 'Suno', version: '2.0' },
        },
      },
    };
    expect(describeAuditTaskPlugin(entry)).toEqual({
      key: 'suno',
      name: 'Suno',
      version: '2.0',
      platform: 'Suno',
    });
    expect(describeAuditTaskPlugin({ other: {} })).toBeNull();
    expect(
      describeAuditTaskPlugin({
        other: { root_info: { task_plugin: { key: 'k', name: 'n' } } },
      }).key,
    ).toBe('k');
  });

  it('auditRoleName maps known roles', () => {
    expect(auditRoleName(100)).toBe('超级管理员');
    expect(auditRoleName(10)).toBe('管理员');
    expect(auditRoleName(1)).toBe('普通用户');
    expect(auditRoleName(7)).toBe('7');
  });
});
