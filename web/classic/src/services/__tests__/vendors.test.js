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
  },
}));

vi.mock('../../helpers', () => ({
  API,
  translateServerText: (text) => `zh:${text}`,
}));

import {
  VENDOR_ACTION,
  applyVendorOperation,
  getVendorErrorText,
  previewVendorOperation,
  searchVendors,
} from '../vendors';

// 契约样例来自后端 controller/vendor_meta.go（ApiSuccess 包裹 PageInfo /
// VendorOperationPreview / VendorOperationResult）与 vendorAPIError 的
// 409 code / reference_counts。
const REFERENCED_BODY = {
  success: false,
  message:
    'vendors are still referenced by models; transfer or clear their assignments first',
  code: 'VENDOR_REFERENCED',
  reference_counts: { 3: 2, 7: 5 },
};

const axiosError = (payload, status = 409) =>
  Object.assign(new Error(payload.message), {
    name: 'AxiosError',
    response: { status, data: payload },
  });

describe('searchVendors', () => {
  beforeEach(() => {
    API.get.mockReset();
  });

  it('maps paging onto p / page_size and omits empty filters', async () => {
    API.get.mockResolvedValue({
      data: { success: true, data: { items: [{ id: 1 }], total: 1 } },
    });

    await expect(searchVendors({ page: 2, pageSize: 50 })).resolves.toEqual({
      items: [{ id: 1 }],
      total: 1,
    });
    expect(API.get).toHaveBeenCalledWith('/api/vendors/search', {
      params: { p: 2, page_size: 50 },
    });
  });

  it('forwards keyword and association filters', async () => {
    API.get.mockResolvedValue({
      data: { success: true, data: { items: [], total: 0 } },
    });

    await searchVendors({
      keyword: 'openai',
      association: 'unlinked',
      page: 1,
      pageSize: 20,
    });
    expect(API.get).toHaveBeenCalledWith('/api/vendors/search', {
      params: {
        p: 1,
        page_size: 20,
        keyword: 'openai',
        association: 'unlinked',
      },
    });
  });

  it('normalises a missing payload to an empty list', async () => {
    API.get.mockResolvedValue({ data: { success: true } });
    await expect(searchVendors({})).resolves.toEqual({ items: [], total: 0 });
  });

  it('folds a failed payload into a coded error', async () => {
    API.get.mockResolvedValue({
      data: { success: false, message: 'vendor does not exist' },
    });
    await expect(searchVendors({ keyword: 'x' })).rejects.toMatchObject({
      code: '',
      message: 'vendor does not exist',
    });
  });
});

describe('vendor operations', () => {
  beforeEach(() => {
    API.post.mockReset();
  });

  it('posts preview and unwraps the returned version', async () => {
    const preview = {
      action: VENDOR_ACTION.merge,
      sources: [{ id: 3, name: 'A' }],
      target: { id: 7, name: 'B' },
      models: [
        { id: 11, model_name: 'gpt-4o', vendor_id: 3, vendor_name: 'A' },
      ],
      version: 'sha256-preview',
    };
    API.post.mockResolvedValue({ data: { success: true, data: preview } });

    const operation = {
      action: VENDOR_ACTION.merge,
      vendor_ids: [3],
      model_ids: [],
      target_vendor_id: 7,
    };
    await expect(previewVendorOperation(operation)).resolves.toEqual(preview);
    expect(API.post).toHaveBeenCalledWith(
      '/api/vendors/operations/preview',
      operation,
    );
  });

  it('applies changes with the expected version', async () => {
    API.post.mockResolvedValue({
      data: {
        success: true,
        data: { updated_models: [11, 12], deleted_vendors: [3] },
      },
    });

    const operation = {
      action: VENDOR_ACTION.merge,
      vendor_ids: [3],
      model_ids: [],
      target_vendor_id: 7,
      expected_version: 'sha256-preview',
    };
    await expect(applyVendorOperation(operation)).resolves.toEqual({
      updated_models: [11, 12],
      deleted_vendors: [3],
    });
    expect(API.post).toHaveBeenCalledWith('/api/vendors/operations', operation);
  });

  it('keeps 409 reference counts reachable for the caller', async () => {
    API.post.mockRejectedValue(axiosError(REFERENCED_BODY));

    await expect(
      applyVendorOperation({
        action: VENDOR_ACTION.delete,
        vendor_ids: [3, 7],
      }),
    ).rejects.toMatchObject({
      code: 'VENDOR_REFERENCED',
      referenceCounts: { 3: 2, 7: 5 },
    });
  });

  it('rethrows transport errors without a response body', async () => {
    const networkError = new Error('Network Error');
    API.post.mockRejectedValue(networkError);
    await expect(previewVendorOperation({})).rejects.toBe(networkError);
  });
});

describe('getVendorErrorText', () => {
  const t = (key, params) =>
    params === undefined ? key : `${key}${JSON.stringify(params)}`;

  // buildVendorError 的输出形态：code / referenceCounts 挂在 Error 上
  const codedError = (code, message, referenceCounts = null) =>
    Object.assign(new Error(message), { code, referenceCounts });

  it('sums the model counts of every referenced vendor', () => {
    const error = codedError(
      'VENDOR_REFERENCED',
      REFERENCED_BODY.message,
      REFERENCED_BODY.reference_counts,
    );
    expect(getVendorErrorText(error, t)).toBe(
      '所选供应商仍关联 {{count}} 个模型，请先转移或解除关联。{"count":7}',
    );
  });

  it('asks for a fresh preview on a version conflict', () => {
    const error = codedError(
      'VENDOR_CONFLICT',
      'vendor data changed; preview again before applying',
    );
    expect(getVendorErrorText(error, t)).toBe(
      '供应商数据已变更，请重新预览后再执行。',
    );
  });

  it('translates plain server messages, then falls back', () => {
    expect(
      getVendorErrorText({ code: '', message: 'vendor name is required' }, t),
    ).toBe('zh:vendor name is required');
    expect(getVendorErrorText({ code: '', message: '' }, t)).toBe('操作失败');
    expect(getVendorErrorText(undefined, t)).toBe('操作失败');
  });
});
