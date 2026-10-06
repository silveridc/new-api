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

import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime';

// 旧实现用 new Function 直接执行表达式，可运行任意代码；这里改用新版
// 前端的受限计费表达式求值器（parser + runtime），token 语义保持一致，
// 并支持 fixed() 与 img_cr（图片缓存）。结果形状与旧实现兼容：
// { cost, matchedTier, error }。
export function evalExprLocally(exprStr, p, c, extraTokenValues = {}) {
  const cacheReadTokens = extraTokenValues.cacheReadTokens || 0;
  const cacheCreateTokens = extraTokenValues.cacheCreateTokens || 0;
  const cacheCreate1hTokens = extraTokenValues.cacheCreate1hTokens || 0;
  // 与旧实现一致：len 表示请求的总输入 token 数
  const len = p + cacheReadTokens + cacheCreateTokens + cacheCreate1hTokens;
  const tokens = {
    p,
    c,
    len,
    cr: cacheReadTokens,
    cc: cacheCreateTokens,
    cc1h: cacheCreate1hTokens,
    img: extraTokenValues.imageTokens || 0,
    img_cr: extraTokenValues.imageCacheTokens || 0,
    img_o: extraTokenValues.imageOutputTokens || 0,
    ai: extraTokenValues.audioInputTokens || 0,
    ao: extraTokenValues.audioOutputTokens || 0,
  };

  const result = evaluateBillingExpression(exprStr, { tokens });
  if (result.status === 'success') {
    return {
      cost: result.cost,
      matchedTier: result.matchedTier || '',
      error: null,
    };
  }

  const diagnostic = result.diagnostic || {};
  const detail = diagnostic.detail
    ? `${diagnostic.code}: ${diagnostic.detail}`
    : diagnostic.code || result.status;
  return { cost: 0, matchedTier: '', error: detail };
}
