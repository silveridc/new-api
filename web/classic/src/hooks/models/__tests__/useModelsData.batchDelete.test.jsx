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
import {
  renderHookCompat as renderHook,
  actAsync as act,
  cleanupHookCompat,
} from '@/hooks/channels/__tests__/renderHookCompat';

const { API, showError, showSuccess } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  // 保留 count，便于断言成功文案里的删除数取自后端 deleted_count
  useTranslation: () => ({
    t: (key, options) =>
      options && options.count !== undefined ? `${key}:${options.count}` : key,
  }),
}));

vi.mock('../../../helpers', () => ({
  API,
  showError,
  showSuccess,
}));

vi.mock('../../../constants', () => ({
  ITEMS_PER_PAGE: 10,
}));

vi.mock('../../common/useTableCompactMode', () => ({
  useTableCompactMode: () => [false, vi.fn()],
}));

import { useModelsData } from '../useModelsData';

const rows = [
  { id: 3, model_name: 'gpt-4o', name_rule: 0 },
  { id: 7, model_name: 'claude-3-5-sonnet', name_rule: 1 },
];

const resp = (payload) =>
  Promise.resolve({ data: { success: true, data: payload } });

const modelsListCalls = () =>
  API.get.mock.calls.filter(([url]) => String(url).startsWith('/api/models/?'))
    .length;

const setup = () => {
  API.get.mockImplementation((url) => {
    if (String(url).startsWith('/api/models/')) {
      return Promise.resolve({
        data: {
          success: true,
          data: { items: rows, total: rows.length, page: 1 },
        },
      });
    }
    return Promise.resolve({ data: { success: true, data: { items: [] } } });
  });
  return renderHook(() => useModelsData());
};

const selectRows = async (result, items = rows) => {
  await act(async () => {
    result.current.setSelectedKeys(items);
  });
};

describe('useModelsData.batchDeleteModels 与专用批量删除端点契约', () => {
  beforeEach(() => {
    API.delete.mockClear();
    API.post.mockClear();
    showError.mockClear();
    showSuccess.mockClear();
  });

  afterEach(() => {
    cleanupHookCompat();
  });

  it('改走 POST /api/models/delete 单事务端点，不再逐个 DELETE', async () => {
    const { result } = setup();
    await act(async () => {});
    API.post.mockReturnValue(resp({ deleted_count: 2, updated_channels: 1 }));
    await selectRows(result);

    let success;
    await act(async () => {
      success = await result.current.batchDeleteModels({
        removeFromChannels: true,
        removePricing: true,
      });
    });

    expect(success).toBe(true);
    expect(API.post).toHaveBeenCalledWith('/api/models/delete', {
      model_ids: [3, 7],
      remove_from_channels: true,
      remove_pricing: true,
    });
    expect(API.delete).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('成功删除 {{count}} 个模型:2');
    expect(result.current.selectedKeys).toEqual([]);
  });

  it('删除成功后刷新列表，删除数取自后端 deleted_count 而非选中数', async () => {
    const { result } = setup();
    await act(async () => {});
    const before = modelsListCalls();
    API.post.mockReturnValue(resp({ deleted_count: 1, updated_channels: 0 }));
    await selectRows(result);

    await act(async () => {
      await result.current.batchDeleteModels({});
    });

    expect(modelsListCalls()).toBeGreaterThan(before);
    expect(showSuccess).toHaveBeenCalledWith('成功删除 {{count}} 个模型:1');
  });

  it('未勾选清理项时两个开关都发 false', async () => {
    const { result } = setup();
    await act(async () => {});
    API.post.mockReturnValue(resp({ deleted_count: 1 }));
    await selectRows(result, [rows[0]]);

    await act(async () => {
      await result.current.batchDeleteModels();
    });

    expect(API.post).toHaveBeenCalledWith('/api/models/delete', {
      model_ids: [3],
      remove_from_channels: false,
      remove_pricing: false,
    });
  });

  it('后端拒绝时不清空选择、不提示成功', async () => {
    const { result } = setup();
    await act(async () => {});
    const before = modelsListCalls();
    API.post.mockReturnValue(
      Promise.resolve({
        data: {
          success: false,
          message: 'only exact-match models can be removed from channels',
        },
      }),
    );
    await selectRows(result);

    let success;
    await act(async () => {
      success = await result.current.batchDeleteModels({
        removeFromChannels: true,
      });
    });

    expect(success).toBe(false);
    expect(showError).toHaveBeenCalledWith(
      'only exact-match models can be removed from channels',
    );
    expect(showSuccess).not.toHaveBeenCalled();
    expect(result.current.selectedKeys).toHaveLength(2);
    expect(modelsListCalls()).toBe(before);
  });

  it('HTTP 错误（如非 Root 移除定价的 403）展示后端 message', async () => {
    const { result } = setup();
    await act(async () => {});
    API.post.mockRejectedValue({
      name: 'AxiosError',
      message: 'Request failed with status code 403',
      response: {
        status: 403,
        data: {
          success: false,
          message: 'Model pricing is managed by a super administrator.',
        },
      },
    });
    await selectRows(result);

    let success;
    await act(async () => {
      success = await result.current.batchDeleteModels({ removePricing: true });
    });

    expect(success).toBe(false);
    expect(showError).toHaveBeenCalledWith(
      'Model pricing is managed by a super administrator.',
    );
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('未选择模型时不发请求', async () => {
    const { result } = setup();
    await act(async () => {});

    let success;
    await act(async () => {
      success = await result.current.batchDeleteModels({});
    });

    expect(success).toBe(false);
    expect(API.post).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith('请至少选择一个模型');
  });
});
