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

/**
 * 供应商管理数据层。契约来源：
 * - 后端 model/vendor_management.go：VendorOperation{action, vendor_ids|model_ids,
 *   target_vendor_id, expected_version}。preview 返回 {action, sources, target,
 *   models, version}，apply 必须带回同一个 version；version 不匹配即 409
 *   VENDOR_CONFLICT（他人已改动），删除仍被模型引用的供应商返回 409
 *   VENDOR_REFERENCED 并附 reference_counts。
 * - 列表走 GET /api/vendors/search（keyword 模糊匹配 name/description，
 *   association=linked|unlinked 按是否关联模型过滤）。
 * - 新版前端参考实现：web/src/features/models/vendor-api.ts
 */

import { API, translateServerText } from '../helpers';

export const VENDOR_ACTION = {
  assign: 'assign',
  merge: 'merge',
  delete: 'delete',
};

export const VENDOR_CONFLICT = 'VENDOR_CONFLICT';
export const VENDOR_REFERENCED = 'VENDOR_REFERENCED';

/** 把失败响应折叠成带 code / referenceCounts 的 Error，展示文案交给调用方。 */
function buildVendorError(payload) {
  const error = new Error(payload?.message || '');
  error.code = typeof payload?.code === 'string' ? payload.code : '';
  error.referenceCounts = payload?.reference_counts || null;
  return error;
}

async function requestVendorOperation(url, operation) {
  let response;
  try {
    response = await API.post(url, operation);
  } catch (error) {
    // 409 等业务冲突走 axios 拒绝分支，响应体里仍有 code / reference_counts
    if (error.response?.data) {
      throw buildVendorError(error.response.data);
    }
    throw error;
  }
  if (!response.data?.success) {
    throw buildVendorError(response.data);
  }
  return response.data.data;
}

export async function searchVendors({
  keyword = '',
  association = '',
  page = 1,
  pageSize = 20,
} = {}) {
  const params = { p: page, page_size: pageSize };
  if (keyword) params.keyword = keyword;
  if (association) params.association = association;
  let response;
  try {
    response = await API.get('/api/vendors/search', { params });
  } catch (error) {
    if (error.response?.data) {
      throw buildVendorError(error.response.data);
    }
    throw error;
  }
  if (!response.data?.success) {
    throw buildVendorError(response.data);
  }
  const data = response.data.data || {};
  return {
    items: data.items || [],
    total: data.total || 0,
  };
}

export function previewVendorOperation(operation) {
  return requestVendorOperation('/api/vendors/operations/preview', operation);
}

export function applyVendorOperation(operation) {
  return requestVendorOperation('/api/vendors/operations', operation);
}

/** 供应商接口错误 → 界面文案；未命中映射的原始报错保持透出。 */
export function getVendorErrorText(error, t) {
  if (error?.code === VENDOR_REFERENCED) {
    const count = Object.values(error.referenceCounts || {}).reduce(
      (sum, value) => sum + value,
      0,
    );
    return t('所选供应商仍关联 {{count}} 个模型，请先转移或解除关联。', {
      count,
    });
  }
  if (error?.code === VENDOR_CONFLICT) {
    return t('供应商数据已变更，请重新预览后再执行。');
  }
  if (error?.message) {
    return translateServerText(error.message) || t('操作失败');
  }
  return t('操作失败');
}
