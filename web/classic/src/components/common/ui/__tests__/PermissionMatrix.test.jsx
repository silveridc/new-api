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

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';

// classic 本地 React 18：与 useUsersData 测试一致，用 createElement + 自建
// createRoot 渲染，避免混用父级 React 19 的测试工具。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s) => s }),
}));

// semi-ui barrel 会连带引入 lottie-web，其模块初始化要操作 canvas，
// jsdom 未实现 canvas.getContext，这里在加载模块前打桩。
vi.hoisted(() => {
  if (typeof window !== 'undefined') {
    const noop = () => {};
    const stubContext = new Proxy(
      {},
      {
        get: (target, prop) => {
          if (prop === 'canvas') {
            return { width: 0, height: 0 };
          }
          return noop;
        },
        set: () => true,
      },
    );
    window.HTMLCanvasElement.prototype.getContext = () => stubContext;
  }
});

import PermissionMatrix from '../PermissionMatrix';

const RESOURCES = [
  {
    resource: 'audit',
    label_key: '审计',
    actions: [
      { action: 'read', label_key: '读取', description_key: '查看审计日志' },
      { action: 'operate', label_key: '操作', description_key: '处理审计事件' },
    ],
  },
  {
    resource: 'channel',
    label_key: '渠道',
    actions: [
      { action: 'write', label_key: '写入', description_key: '修改渠道配置' },
    ],
  },
];

const FULL_VALUE = {
  audit: { read: false, operate: false },
  channel: { write: false },
};

let root = null;
let container = null;

const renderElement = (element) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  React.act(() => {
    root.render(element);
  });
  return container;
};

const rerenderElement = (element) => {
  React.act(() => {
    root.render(element);
  });
};

const teardown = () => {
  if (root) {
    try {
      root.unmount();
    } catch (error) {
      // 已卸载忽略
    }
    root = null;
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
  container = null;
};

const checkboxInputs = (scope) =>
  Array.from(scope.querySelectorAll('input[type=checkbox]'));

describe('PermissionMatrix（Semi Checkbox 权限矩阵）', () => {
  afterEach(teardown);

  it('按 catalog 渲染资源分组与动作勾选框，value 决定勾选态', () => {
    const containerEl = renderElement(
      React.createElement(PermissionMatrix, {
        resources: RESOURCES,
        value: { ...FULL_VALUE, audit: { read: true, operate: false } },
        onChange: () => {},
      }),
    );

    const groups = containerEl.querySelectorAll('[role=group]');
    expect(groups.length).toBe(2);
    expect(groups[0].getAttribute('aria-label')).toBe('审计');
    expect(groups[1].getAttribute('aria-label')).toBe('渠道');

    const inputs = checkboxInputs(containerEl);
    expect(inputs.length).toBe(3);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);
    expect(inputs[2].checked).toBe(false);

    // Semi Checkbox 无原生 label 包裹：可访问名称由 aria-labelledby 指向 addon 节点
    const labels = inputs.map((input) => {
      const nameEl = document.getElementById(input.getAttribute('aria-labelledby'));
      return nameEl ? nameEl.textContent.trim() : '';
    });
    expect(labels).toEqual(['读取', '操作', '写入']);
  });

  it('点击勾选框通过 onChange 回传整份矩阵（受控）', () => {
    const changes = [];
    const containerEl = renderElement(
      React.createElement(PermissionMatrix, {
        resources: RESOURCES,
        value: FULL_VALUE,
        onChange: (next) => changes.push(next),
      }),
    );

    React.act(() => {
      checkboxInputs(containerEl)[2].click();
    });

    expect(changes.length).toBe(1);
    expect(changes[0]).toEqual({
      audit: { read: false, operate: false },
      channel: { write: true },
    });

    // 受控组件：用回传值重渲染后 DOM 勾选态随之更新
    rerenderElement(
      React.createElement(PermissionMatrix, {
        resources: RESOURCES,
        value: changes[0],
        onChange: (next) => changes.push(next),
      }),
    );
    expect(checkboxInputs(containerEl)[2].checked).toBe(true);
  });

  it('动作描述通过 aria-describedby 关联到文档中的隐藏说明节点', () => {
    const containerEl = renderElement(
      React.createElement(PermissionMatrix, {
        resources: RESOURCES,
        value: FULL_VALUE,
        onChange: () => {},
      }),
    );

    const inputs = checkboxInputs(containerEl);
    inputs.forEach((input) => {
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const desc = document.getElementById(describedBy);
      expect(desc).not.toBeNull();
      expect(desc.textContent.length).toBeGreaterThan(0);
    });
    expect(document.getElementById(inputs[0].getAttribute('aria-describedby')).textContent).toBe(
      '查看审计日志',
    );
  });

  it('catalog 未登记的 value 残留项渲染为禁用勾选框（后端不可授予）', () => {
    const containerEl = renderElement(
      React.createElement(PermissionMatrix, {
        resources: RESOURCES,
        value: { ...FULL_VALUE, task_plugin: { read: true } },
        onChange: () => {},
      }),
    );

    const groups = containerEl.querySelectorAll('[role=group]');
    expect(groups.length).toBe(3);
    expect(groups[2].getAttribute('aria-label')).toBe('不可授予的权限');

    const staleInput = checkboxInputs(groups[2])[0];
    expect(staleInput.disabled).toBe(true);
    expect(staleInput.checked).toBe(true);
    expect(groups[2].textContent).toContain('task_plugin:read');
  });

  it('disabled 属性禁用全部勾选框（含已勾选项不可取消）', () => {
    const changes = [];
    const containerEl = renderElement(
      React.createElement(PermissionMatrix, {
        resources: RESOURCES,
        value: { ...FULL_VALUE, audit: { read: true, operate: false } },
        onChange: (next) => changes.push(next),
        disabled: true,
      }),
    );

    const inputs = checkboxInputs(containerEl);
    expect(inputs.every((input) => input.disabled)).toBe(true);
    React.act(() => {
      inputs[0].click();
    });
    expect(changes.length).toBe(0);
  });
});
