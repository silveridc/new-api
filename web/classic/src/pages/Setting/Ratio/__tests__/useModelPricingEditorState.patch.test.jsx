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
import { renderHookCompat as renderHook, actAsync as act, cleanupHookCompat } from '../../../../hooks/channels/__tests__/renderHookCompat';

const { API, showError, showInfo, showSuccess } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('../../../../helpers', () => ({
  API,
  showError,
  showInfo,
  showSuccess,
  loadChannelModels: vi.fn(async () => {}),
  copy: vi.fn(async () => true),
  toBoolean: (value) => value === true || value === 'true',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s) => s }),
}));

import { useModelPricingEditorState } from '../hooks/useModelPricingEditorState';

const baseOptions = {
  ModelPrice: '{}',
  ModelRatio: JSON.stringify({ A: 2, B: 1 }),
  CompletionRatio: JSON.stringify({ A: 4 }),
  CompletionRatioMeta: '{}',
  CacheRatio: '{}',
  CreateCacheRatio: '{}',
  ImageRatio: '{}',
  AudioRatio: '{}',
  AudioCompletionRatio: '{}',
};

const snapshot = {
  entries: [
    {
      model_name: 'A',
      version: 'ver-A',
      configured: {
        ModelRatio: 2,
        CompletionRatio: 4,
        // 管理员配置里可能有插件级 override，保存时必须保留
        'billing_setting.plugin_billing_expr': { some_plugin: 'p * 1' },
      },
    },
    {
      model_name: 'B',
      version: 'ver-B',
      configured: { ModelRatio: 1 },
    },
  ],
  options: {},
  empty_version: 'empty-ver',
};

const setup = () => {
  API.get.mockImplementation((url) => {
    if (url === '/api/option/model_pricing') {
      return Promise.resolve({ data: { success: true, data: snapshot } });
    }
    return Promise.resolve({ data: { success: true, data: null } });
  });
  return renderHook(() =>
    useModelPricingEditorState({
      options: baseOptions,
      refresh: vi.fn(async () => {}),
      t: (s) => s,
    }),
  );
};

describe('useModelPricingEditorState 增量保存（PATCH /api/option/model_pricing）', () => {
  beforeEach(() => {
    API.get.mockClear();
    API.patch.mockClear();
    API.put.mockClear();
    showError.mockClear();
    showInfo.mockClear();
    showSuccess.mockClear();
  });

  afterEach(() => {
    cleanupHookCompat();
  });

  it('进入编辑器时拉取 /api/option/model_pricing 快照', async () => {
    setup();
    await act(async () => {});
    expect(API.get).toHaveBeenCalledWith('/api/option/model_pricing');
  });

  it('提交时仅对 dirty 模型发 PATCH，并保留配置中的其它键', async () => {
    API.patch.mockResolvedValue({ data: { success: true, data: {} } });
    const { result, unmount } = setup();
    await act(async () => {});

    await act(async () => {
      result.current.setSelectedModelName('A');
    });
    // A: inputPrice 2 -> 3（ModelRatio 2 -> 1.5）
    await act(async () => {
      result.current.handleNumericFieldChange('inputPrice', '3');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(API.patch).toHaveBeenCalledTimes(1);
    expect(API.patch).toHaveBeenCalledWith('/api/option/model_pricing', {
      changes: [
        {
          model_name: 'A',
          expected_version: 'ver-A',
          pricing: {
            ModelRatio: 1.5,
            CompletionRatio: 5.333333333333,
            'billing_setting.plugin_billing_expr': { some_plugin: 'p * 1' },
          },
        },
      ],
    });
    // 不再全量覆盖 option
    expect(API.put).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalled();
    unmount();
  });

  it('没有变更时不发请求', async () => {
    const { result, unmount } = setup();
    await act(async () => {});
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(API.patch).not.toHaveBeenCalled();
    unmount();
  });

  it('新增模型使用 empty_version', async () => {
    API.patch.mockResolvedValue({ data: { success: true, data: {} } });
    const { result, unmount } = setup();
    await act(async () => {});

    await act(async () => {
      result.current.addModel('C');
    });
    await act(async () => {
      result.current.handleNumericFieldChange('inputPrice', '6');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(API.patch).toHaveBeenCalledTimes(1);
    const payload = API.patch.mock.calls[0][1];
    expect(payload.changes).toHaveLength(1);
    expect(payload.changes[0].model_name).toBe('C');
    expect(payload.changes[0].expected_version).toBe('empty-ver');
    expect(payload.changes[0].pricing).toEqual({ ModelRatio: 3 });
    unmount();
  });

  it('409 版本冲突时展示错误并保留用户草稿', async () => {
    API.patch.mockRejectedValue({
      response: {
        status: 409,
        data: { success: false, message: 'model pricing changed; reload' },
      },
    });
    const { result, unmount } = setup();
    await act(async () => {});

    await act(async () => {
      result.current.setSelectedModelName('A');
    });
    await act(async () => {
      result.current.handleNumericFieldChange('inputPrice', '3');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(showError).toHaveBeenCalledWith('model pricing changed; reload');
    expect(showSuccess).not.toHaveBeenCalled();
    // 草稿仍在：未重建 models，未刷新
    const draftA = result.current.models.find((m) => m.name === 'A');
    expect(draftA.inputPrice).toBe('3');
    unmount();
  });
});
