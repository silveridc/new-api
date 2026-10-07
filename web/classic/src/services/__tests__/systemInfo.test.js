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
    delete: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  DEFAULT_SYSTEM_TASK_LIMIT,
  SYSTEM_TASK_SCOPE,
  systemTaskTypeLabel,
  isSystemTaskStatus,
  extractTaskProgress,
  listSystemInstances,
  deleteStaleSystemInstances,
  deleteStaleSystemInstance,
  buildSystemTaskQuery,
  listSystemTasks,
  deleteSystemTaskHistory,
  buildInstanceRows,
  buildSystemTaskRows,
} from '../systemInfo';

// 契约样例来自后端 model/system_instance.go SystemInstanceResponse（Info 反序列化）
// 与 model/system_task.go SystemTaskResponse。
const INSTANCE = {
  node_name: 'node-1',
  status: 'online',
  stale_after_seconds: 60,
  started_at: 1700000000,
  last_seen_at: 1700001000,
  info: {
    node: { name: 'node-1' },
    role: { is_master: true },
    runtime: { version: 'v1.2.3', goos: 'linux', goarch: 'amd64' },
    host: { hostname: 'host-a' },
    resources: {
      cpu: { usage_percent: 12.5 },
      memory: { usage_percent: 40 },
    },
  },
};

const TASK = {
  id: 1,
  task_id: 'task-abc',
  type: 'log_cleanup',
  status: 'running',
  state: { total: 100, processed: 40, progress: 40, remaining: 60 },
  payload: { target_timestamp: 1, batch_size: 2 },
  result: null,
  error: '',
  locked_by: 'node-1',
  created_at: 1700000000,
  updated_at: 1700000100,
};

describe('systemInfo service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps system task types and statuses', () => {
    expect(systemTaskTypeLabel('log_cleanup')).toBe('日志清理');
    expect(systemTaskTypeLabel('custom_future_type')).toBe(
      'custom_future_type',
    );
    expect(isSystemTaskStatus('running')).toBe(true);
    expect(isSystemTaskStatus('nope')).toBe(false);
    expect(SYSTEM_TASK_SCOPE.ACTIVE).toBe('active');
    expect(DEFAULT_SYSTEM_TASK_LIMIT).toBe(100);
  });

  it('extracts clamped progress from task state', () => {
    expect(extractTaskProgress(TASK)).toBe(40);
    expect(extractTaskProgress({ state: { progress: 150 } })).toBe(100);
    expect(extractTaskProgress({ state: { progress: -5 } })).toBe(0);
    expect(extractTaskProgress({})).toBeNull();
    expect(extractTaskProgress(null)).toBeNull();
  });

  it('GETs /api/system-info/instances and unwraps array', async () => {
    // controller/system_info.go:13-31
    API.get.mockResolvedValue({
      data: { success: true, data: [INSTANCE] },
    });

    const instances = await listSystemInstances();

    expect(API.get).toHaveBeenCalledWith('/api/system-info/instances');
    expect(instances).toEqual([INSTANCE]);
  });

  it('issues stale-instance deletes with counts', async () => {
    // controller/system_info.go:33-45, :45-63
    API.delete.mockResolvedValue({
      data: { success: true, data: { deleted_count: 3 } },
    });

    await expect(deleteStaleSystemInstances()).resolves.toBe(3);
    expect(API.delete).toHaveBeenCalledWith('/api/system-info/stale-instances');

    await expect(deleteStaleSystemInstance('node 1')).resolves.toBe(3);
    expect(API.delete).toHaveBeenCalledWith(
      '/api/system-info/instances/node%201',
    );

    API.delete.mockResolvedValue({
      data: { success: false, message: 'instance is not stale' },
    });
    await expect(deleteStaleSystemInstance('x')).rejects.toThrow(
      'instance is not stale',
    );
  });

  it('builds system-task list query per SystemTaskFilter binding', () => {
    // controller/system_task.go:68-96 + model/system_task.go:178-182
    // scope 只接受 active|history；status 只接受 pending/running/succeeded/failed。
    expect(buildSystemTaskQuery()).toEqual({ limit: 100 });
    expect(
      buildSystemTaskQuery(50, {
        scope: 'history',
        type: 'log_cleanup',
        status: 'failed',
        offset: 20,
      }),
    ).toEqual({
      limit: 50,
      scope: 'history',
      type: 'log_cleanup',
      status: 'failed',
      offset: 20,
    });
    // 非法 status / 空 type 不发送，避免 400
    expect(
      buildSystemTaskQuery(50, { status: 'bogus', type: '' }),
    ).toEqual({ limit: 50 });
  });

  it('GETs /api/system-task/list returning tasks and total', async () => {
    API.get.mockResolvedValue({
      data: { success: true, data: [TASK], total: 1 },
    });

    const { tasks, total } = await listSystemTasks(100, { scope: 'active' });

    expect(API.get).toHaveBeenCalledWith('/api/system-task/list', {
      params: { limit: 100, scope: 'active' },
    });
    expect(tasks).toEqual([TASK]);
    expect(total).toBe(1);
  });

  it('DELETEs /api/system-task/history with optional filters', async () => {
    API.delete.mockResolvedValue({
      data: { success: true, data: { deleted_count: 7 } },
    });

    await expect(
      deleteSystemTaskHistory({ type: 'log_cleanup', status: 'failed' }),
    ).resolves.toBe(7);
    expect(API.delete).toHaveBeenCalledWith('/api/system-task/history', {
      params: { type: 'log_cleanup', status: 'failed' },
    });
  });

  it('builds instance rows with nested info fallbacks', () => {
    const rows = buildInstanceRows([INSTANCE, { node_name: 'node-2' }]);
    expect(rows[0]).toMatchObject({
      key: 'node-1',
      display_name: 'node-1',
      role: 'master',
      version: 'v1.2.3',
      platform: 'linux/amd64',
      hostname: 'host-a',
      status: 'online',
      cpu_percent: 12.5,
      memory_percent: 40,
      stale_after_seconds: 60,
    });
    // 缺失 info 时全部回落
    expect(rows[1]).toMatchObject({
      display_name: 'node-2',
      role: 'worker',
      version: '-',
      platform: '-',
      status: 'online',
      cpu_percent: null,
      memory_percent: null,
    });
  });

  it('builds task rows with type labels and progress', () => {
    const rows = buildSystemTaskRows([TASK]);
    expect(rows[0]).toMatchObject({
      key: 'task-abc',
      type: 'log_cleanup',
      type_label: '日志清理',
      status: 'running',
      progress: 40,
      locked_by: 'node-1',
    });
    expect(buildSystemTaskRows(undefined)).toEqual([]);
  });
});
