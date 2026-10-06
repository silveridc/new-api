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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHookCompat as renderHook, actAsync as act, cleanupHookCompat } from './renderHookCompat';

const { API, showError, showInfo, showSuccess } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s) => s }),
}));

vi.mock('../../../helpers', () => ({
  API,
  showError,
  showInfo,
  showSuccess,
  loadChannelModels: vi.fn(async () => {}),
  copy: vi.fn(async () => true),
  toBoolean: (value) => value === true || value === 'true',
}));

vi.mock('../../../constants', () => ({
  CHANNEL_OPTIONS: [],
  ITEMS_PER_PAGE: 10,
  MODEL_TABLE_PAGE_SIZE: 10,
}));

vi.mock('../../common/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../../common/useTableCompactMode', () => ({
  useTableCompactMode: () => [false, vi.fn()],
}));

vi.mock('../useChannelUpstreamUpdates', () => ({
  useChannelUpstreamUpdates: () => ({}),
}));

vi.mock('../upstreamUpdateUtils', () => ({
  parseUpstreamUpdateMeta: () => null,
}));

vi.mock('@douyinfe/semi-ui', () => ({
  Modal: { info: vi.fn(), destroyAll: vi.fn() },
  Button: () => null,
}));

vi.mock(
  '../../../components/table/channels/modals/CodexUsageModal',
  () => ({
    openCodexUsageModal: vi.fn(),
  }),
);

import { useChannelsData } from '../useChannelsData';

const resp = (data) => Promise.resolve({ data: { success: true, data } });

const clearAll = () => {
  API.get.mockClear();
  API.post.mockClear();
  API.put.mockClear();
  API.delete.mockClear();
  showError.mockClear();
  showInfo.mockClear();
  showSuccess.mockClear();
};

const setup = () => {
  API.get.mockImplementation((url) => {
    if (url.startsWith('/api/channel/?')) {
      return Promise.resolve({
        data: {
          success: true,
          data: { items: [], total: 0, type_counts: {} },
        },
      });
    }
    if (url.startsWith('/api/option/')) {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    if (url.startsWith('/api/group/')) {
      return Promise.resolve({ data: { success: true, data: ['default'] } });
    }
    return Promise.resolve({ data: { success: true, data: null } });
  });
  return renderHook(() => useChannelsData());
};

describe('useChannelsData.manageChannel 与新版后端契约', () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    cleanupHookCompat();
  });

  it('启用渠道走 POST /api/channel/:id/status，状态取自请求动作而非响应', async () => {
    const { result } = setup();
    await act(async () => {});
    clearAll();

    // 新版后端 data 为 boolean（是否发生变更），没有 channel.status 可读
    API.post.mockReturnValue(resp(false));
    const record = { id: 5, status: 2 };

    await act(async () => {
      await result.current.manageChannel(5, 'enable', record);
    });

    expect(API.post).toHaveBeenCalledWith('/api/channel/5/status', {
      status: 1,
    });
    expect(API.put).not.toHaveBeenCalled();
    expect(record.status).toBe(1);
    expect(showSuccess).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('禁用渠道走 POST /api/channel/:id/status', async () => {
    const { result } = setup();
    await act(async () => {});
    clearAll();

    API.post.mockReturnValue(resp(false));
    const record = { id: 6, status: 1 };

    await act(async () => {
      await result.current.manageChannel(6, 'disable', record);
    });

    expect(API.post).toHaveBeenCalledWith('/api/channel/6/status', {
      status: 2,
    });
    expect(API.put).not.toHaveBeenCalled();
    expect(record.status).toBe(2);
    expect(showSuccess).toHaveBeenCalled();
  });

  it('多密钥全部启用走 POST /api/channel/multi_key/manage 并刷新列表', async () => {
    const { result } = setup();
    await act(async () => {});
    clearAll();

    API.post.mockReturnValue(resp(null));
    const record = { id: 7, status: 2, channel_info: { is_multi_key: true } };

    await act(async () => {
      await result.current.manageChannel(7, 'enable_all', record);
    });

    expect(API.post).toHaveBeenCalledWith('/api/channel/multi_key/manage', {
      channel_id: 7,
      action: 'enable_all_keys',
    });
    expect(API.put).not.toHaveBeenCalled();
    // enable_all 之后应重新拉取列表
    expect(
      API.get.mock.calls.some(([url]) => String(url).startsWith('/api/channel/?')),
    ).toBe(true);
    expect(showSuccess).toHaveBeenCalled();
  });

  it('失败时不改状态并展示错误', async () => {
    const { result } = setup();
    await act(async () => {});
    clearAll();

    API.post.mockReturnValue(
      Promise.resolve({ data: { success: false, message: 'boom' } }),
    );
    const record = { id: 8, status: 2 };

    await act(async () => {
      await result.current.manageChannel(8, 'enable', record);
    });

    expect(record.status).toBe(2);
    expect(showError).toHaveBeenCalledWith('boom');
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('priority/weight 仍走 PUT /api/channel/（回归保护）', async () => {
    const { result } = setup();
    await act(async () => {});
    clearAll();

    API.put.mockReturnValue(resp({ id: 9, status: 1 }));
    const record = { id: 9, status: 1 };

    await act(async () => {
      await result.current.manageChannel(9, 'priority', record, '3');
    });

    expect(API.put).toHaveBeenCalledWith('/api/channel/', {
      id: 9,
      priority: 3,
    });
    expect(showSuccess).toHaveBeenCalled();
  });
});
