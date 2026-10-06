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

import { describe, it, expect } from 'vitest';
import { evalExprLocally } from '../components/tieredPricingEval';

const extras = {
  cacheReadTokens: 10,
  cacheCreateTokens: 20,
  cacheCreate1hTokens: 0,
  imageTokens: 30,
  imageOutputTokens: 0,
  audioInputTokens: 0,
  audioOutputTokens: 0,
};

describe('TieredPricingEditor.evalExprLocally 受限表达式求值', () => {
  it('基础 token 语义：p/c/cr/cc/cc1h 参与计算', () => {
    // len = p + cr + cc + cc1h = 100 + 10 + 20 + 0
    const result = evalExprLocally('p * 1 + c * 2 + cr * 0.5 + len * 0', 100, 200, extras);
    expect(result.error).toBeNull();
    expect(result.cost).toBe(100 + 200 * 2 + 10 * 0.5);
  });

  it('tier() 记录命中档位', () => {
    const result = evalExprLocally('tier("base", p * 2 + c * 1)', 100, 50, extras);
    expect(result.error).toBeNull();
    expect(result.cost).toBe(250);
    expect(result.matchedTier).toBe('base');
  });

  it('fixed() 按次计费并返回百万缩放后的成本', () => {
    // 新版语义：fixed() 必须作为 tier() 的档位价格使用
    const result = evalExprLocally('tier("base", fixed(0.5))', 100, 200, extras);
    expect(result.error).toBeNull();
    // 与新版 runtime 一致：fixed(amount) 返回 amount * 1_000_000，
    // 由调用方再按 quota_per_unit 换算
    expect(result.cost).toBe(500000);
    expect(result.matchedTier).toBe('base');
  });

  it('img_cr（图片缓存）变量可用，无输入时按 0 求值', () => {
    const result = evalExprLocally('img * 2 + img_cr * 2 + img_o * 1', 0, 0, {
      ...extras,
      imageTokens: 30,
    });
    expect(result.error).toBeNull();
    expect(result.cost).toBe(60);
  });

  it('条件表达式与比较运算可用', () => {
    const result = evalExprLocally('len > 1000 ? p * 0.9 : p * 1', 100, 0, extras);
    expect(result.error).toBeNull();
    // len = 100 + 10 + 20 = 130，走 else 分支
    expect(result.cost).toBe(100);
  });

  it('非法语法返回错误且不抛出', () => {
    const result = evalExprLocally('p * +', 1, 1, extras);
    expect(result.error).not.toBeNull();
    expect(result.cost).toBe(0);
  });

  it('任意 JavaScript 代码不可执行（受限 parser 拒绝）', () => {
    const result = evalExprLocally('globalThis.__pwned = 1', 1, 1, extras);
    expect(result.error).not.toBeNull();
    expect(globalThis.__pwned).toBeUndefined();

    const call = evalExprLocally('(function(){ return 42 })()', 1, 1, extras);
    expect(call.error).not.toBeNull();
    expect(call.cost).toBe(0);

    const member = evalExprLocally('process.exit(1)', 1, 1, extras);
    expect(member.error).not.toBeNull();
  });

  it('未知变量报错而不是静默为 0', () => {
    const result = evalExprLocally('p * unknown_var', 1, 1, extras);
    expect(result.error).not.toBeNull();
  });
});
