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
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  TaskPluginUsageError,
  unwrapTaskPluginPayload,
  listTaskPlugins,
  getTaskPlugin,
  getTaskPluginVersions,
  uploadTaskPlugin,
  activateTaskPlugin,
  setTaskPluginStatus,
  deleteTaskPluginVersion,
  dryRunTaskPlugin,
  listMarketplaceSources,
  updateMarketplaceSources,
  getTaskPluginEnabledOption,
  setTaskPluginEnabledOption,
  getTaskPluginBindOptions,
} from '../taskPlugins';

const ok = (data) => ({ data: { success: true, message: '', data } });

describe('taskPlugins service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unwrapTaskPluginPayload', () => {
    it('returns payload.data on success', () => {
      expect(unwrapTaskPluginPayload(ok([{ key: 'a' }]))).toEqual([{ key: 'a' }]);
    });

    it('throws TaskPluginUsageError when data carries channels + in_flight_count', () => {
      const response = {
        data: {
          success: false,
          message: 'task plugin is still in use',
          data: { channels: [{ id: 1, name: 'ch' }], in_flight_count: 3 },
        },
      };
      let caught;
      try {
        unwrapTaskPluginPayload(response);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TaskPluginUsageError);
      expect(caught.usage).toEqual({
        channels: [{ id: 1, name: 'ch' }],
        in_flight_count: 3,
      });
    });

    it('throws plain Error on other business failures', () => {
      expect(() =>
        unwrapTaskPluginPayload({ data: { success: false, message: 'boom' } }),
      ).toThrowError('boom');
    });
  });

  it('listTaskPlugins GETs /api/plugin/task and unwraps list', async () => {
    API.get.mockResolvedValue(ok([{ meta: { key: 'a' } }]));
    await expect(listTaskPlugins()).resolves.toEqual([{ meta: { key: 'a' } }]);
    expect(API.get).toHaveBeenCalledWith('/api/plugin/task');
  });

  it('getTaskPlugin encodes key and sends optional version param', async () => {
    API.get.mockResolvedValue(ok({ meta: { key: 'a b' } }));
    await getTaskPlugin('a b');
    expect(API.get).toHaveBeenCalledWith('/api/plugin/task/a%20b', {
      params: undefined,
    });
    await getTaskPlugin('a b', 'v1');
    expect(API.get).toHaveBeenLastCalledWith('/api/plugin/task/a%20b', {
      params: { version: 'v1' },
    });
  });

  it('getTaskPluginVersions GETs versions endpoint', async () => {
    API.get.mockResolvedValue(ok([{ version: 'v1' }]));
    await getTaskPluginVersions('k1');
    expect(API.get).toHaveBeenCalledWith('/api/plugin/task/k1/versions');
  });

  it('uploadTaskPlugin POSTs source/remark/icon and omits empty icon', async () => {
    API.post.mockResolvedValue(ok({ meta: { key: 'x' } }));
    await uploadTaskPlugin({ source: 'export default {}', remark: 'r1' });
    expect(API.post).toHaveBeenCalledWith('/api/plugin/task', {
      source: 'export default {}',
      remark: 'r1',
    });

    await uploadTaskPlugin({
      source: 's',
      remark: 'r',
      icon: 'data:image/png;base64,xx',
      enabled: true,
      sourceSha256: 'ab12',
      force: true,
    });
    expect(API.post).toHaveBeenLastCalledWith('/api/plugin/task', {
      source: 's',
      remark: 'r',
      icon: 'data:image/png;base64,xx',
      enabled: true,
      sourceSha256: 'ab12',
      force: true,
    });
  });

  it('activateTaskPlugin POSTs { version }', async () => {
    API.post.mockResolvedValue(ok(null));
    await activateTaskPlugin('k', 'v2');
    expect(API.post).toHaveBeenCalledWith('/api/plugin/task/k/activate', {
      version: 'v2',
    });
  });

  it('setTaskPluginStatus posts body and maps cascade/force to query params', async () => {
    API.post.mockResolvedValue(ok(null));
    await setTaskPluginStatus('k', false, { cascade: true, force: true });
    expect(API.post).toHaveBeenCalledWith('/api/plugin/task/k/status', {
      enabled: false,
    }, { params: { cascade: true, force: true } });

    await setTaskPluginStatus('k', true);
    expect(API.post).toHaveBeenLastCalledWith(
      '/api/plugin/task/k/status',
      { enabled: true },
      { params: undefined },
    );
  });

  it('deleteTaskPluginVersion DELETEs with encoded version and force param', async () => {
    API.delete.mockResolvedValue(ok(null));
    await deleteTaskPluginVersion('k', '1.0/beta', true);
    expect(API.delete).toHaveBeenCalledWith(
      '/api/plugin/task/k/versions/1.0%2Fbeta',
      { params: { force: true } },
    );
    await deleteTaskPluginVersion('k', 'v1');
    expect(API.delete).toHaveBeenLastCalledWith(
      '/api/plugin/task/k/versions/v1',
      { params: undefined },
    );
  });

  it('dryRunTaskPlugin posts hook/member/args', async () => {
    API.post.mockResolvedValue(ok({ output: 1 }));
    await dryRunTaskPlugin('k', { hook: 'fetch', member: 'm', args: [1] });
    expect(API.post).toHaveBeenCalledWith('/api/plugin/task/k/dryrun', {
      hook: 'fetch',
      member: 'm',
      args: [1],
    });
    await dryRunTaskPlugin('k', { hook: 'fetch' });
    expect(API.post).toHaveBeenLastCalledWith('/api/plugin/task/k/dryrun', {
      hook: 'fetch',
      args: [],
    });
  });

  it('marketplace sources GET/PUT wrap /api/plugin/task/marketplace/sources', async () => {
    API.get.mockResolvedValue(ok([{ name: 'official', index_url: 'https://x' }]));
    await listMarketplaceSources();
    expect(API.get).toHaveBeenCalledWith(
      '/api/plugin/task/marketplace/sources',
    );

    API.put.mockResolvedValue(ok([]));
    await updateMarketplaceSources([{ name: 'a', index_url: 'https://y' }]);
    expect(API.put).toHaveBeenCalledWith(
      '/api/plugin/task/marketplace/sources',
      [{ name: 'a', index_url: 'https://y' }],
    );
  });

  it('enabled option reads/writes TaskPluginEnabled via /api/option/', async () => {
    API.get.mockResolvedValue(
      ok([
        { key: 'TaskPluginEnabled', value: 'true' },
        { key: 'Other', value: 'x' },
      ]),
    );
    await expect(getTaskPluginEnabledOption()).resolves.toBe(true);
    expect(API.get).toHaveBeenCalledWith('/api/option/');

    API.get.mockResolvedValue(
      ok([{ key: 'TaskPluginEnabled', value: 'false' }]),
    );
    await expect(getTaskPluginEnabledOption()).resolves.toBe(false);

    API.put.mockResolvedValue(ok(null));
    await setTaskPluginEnabledOption(false);
    expect(API.put).toHaveBeenCalledWith('/api/option/', {
      key: 'TaskPluginEnabled',
      value: 'false',
    });
  });

  it('getTaskPluginBindOptions GETs /api/task_plugin_options', async () => {
    API.get.mockResolvedValue(ok([{ key: 'suno', name: 'Suno' }]));
    await expect(getTaskPluginBindOptions()).resolves.toEqual([
      { key: 'suno', name: 'Suno' },
    ]);
    expect(API.get).toHaveBeenCalledWith('/api/task_plugin_options');
  });
});
