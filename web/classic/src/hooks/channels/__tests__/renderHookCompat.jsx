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

import * as React from 'react';
import { createRoot } from 'react-dom/client';

// classic 本地自带 React 18，而父级 ../web/node_modules 的
// @testing-library/react / jsx-runtime 跑在 React 19 上；混用两份拷贝会让
// hooks 抛 "Cannot read properties of null"。这里用 classic 自己的
// react-dom 18 提供一个最小 renderHook，仅供 classic 的 hooks 行为测试使用，
// 测试内渲染一律用 React.createElement，避免触发父级 jsx-runtime。
const mountedRoots = [];

// React 18 的 act 需要 Testing Environment 标记才会同步 flush 更新
if (typeof globalThis.IS_REACT_ACT_ENVIRONMENT === 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

export function renderHookCompat(useHookImpl) {
  const resultRef = { current: undefined };
  let container = null;
  let root = null;

  const TestComponent = () => {
    resultRef.current = useHookImpl();
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mountedRoots.push(root);
  // 初始渲染必须包在 act 里同步 flush，否则 result 取不到值
  React.act(() => {
    root.render(React.createElement(TestComponent));
  });
  return {
    // 与 @testing-library/react 的 renderHook 一致：result 是稳定的 ref 对象，
    // 每次渲染后通过 .current 取最新 hook 返回值
    result: resultRef,
    unmount: () => {
      if (root) {
        root.unmount();
        root = null;
      }
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
        container = null;
      }
    },
  };
}

export async function actAsync(fn) {
  return React.act(fn);
}

export function cleanupHookCompat() {
  while (mountedRoots.length) {
    const root = mountedRoots.pop();
    try {
      root.unmount();
    } catch (error) {
      // 已卸载的 root 忽略
    }
  }
}
