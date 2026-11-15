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

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { originalGetContext, originalResizeObserver, originalRangeRect } =
  vi.hoisted(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalRangeRect = Range.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillStyle: '',
      fillRect() {},
      measureText: (text) => ({ width: String(text).length }),
    }));
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Range.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 20,
      width: 100,
      height: 20,
      toJSON() {},
    }));
    return { originalGetContext, originalResizeObserver, originalRangeRect };
  });

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    delete globalThis.ResizeObserver;
  }
  if (originalRangeRect) {
    Range.prototype.getBoundingClientRect = originalRangeRect;
  } else {
    delete Range.prototype.getBoundingClientRect;
  }
});

const { getAuditLogsMock } = vi.hoisted(() => ({
  getAuditLogsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('../../../services/auditLogs', async () => {
  const actual = await vi.importActual('../../../services/auditLogs');
  return { ...actual, getAuditLogs: getAuditLogsMock };
});

vi.mock('../../../helpers', () => ({
  getTodayStartTimestamp: () => 1794700800,
  isAdmin: () => true,
  timestamp2string: (value) =>
    new Date(value * 1000).toISOString().replace('T', ' ').slice(0, 19),
}));

vi.mock('../../../hooks/common/useIsMobile', () => ({
  MOBILE_BREAKPOINT: 768,
  useIsMobile: () => false,
}));

vi.mock('../../../hooks/common/useTableCompactMode', async () => {
  const ReactModule = await vi.importActual('react');
  return {
    useTableCompactMode: () => ReactModule.useState(false),
  };
});

vi.mock('../../../components/common/ui/CardPro', () => ({
  default: (props) => (
    <section>
      <div data-testid='stats-area'>{props.statsArea}</div>
      <div data-testid='search-area'>{props.searchArea}</div>
      <div data-testid='table-area'>{props.children}</div>
      <div data-testid='pagination-area'>{props.paginationArea}</div>
    </section>
  ),
}));

vi.mock('../../../components/common/ui/CardTable', () => ({
  default: ({ columns, dataSource, empty }) => (
    <div role='table'>
      <div role='rowgroup'>
        {columns.map((column) => (
          <span role='columnheader' key={column.key}>
            {column.title}
          </span>
        ))}
      </div>
      {dataSource.length === 0
        ? empty
        : dataSource.map((record) => (
            <div role='row' key={record.event_id}>
              {columns.map((column) => (
                <span key={column.key}>
                  {column.render
                    ? column.render(record[column.dataIndex], record)
                    : record[column.dataIndex]}
                </span>
              ))}
            </div>
          ))}
    </div>
  ),
}));

vi.mock('../../../components/common/ui/CompactModeToggle', () => ({
  default: (props) => (
    <button onClick={() => props.setCompactMode(!props.compactMode)}>
      {props.compactMode ? '自适应列表' : '紧凑列表'}
    </button>
  ),
}));

vi.mock('../AuditColumnSelectorModal', () => ({
  default: (props) =>
    props.visible ? <div role='dialog'>{props.t('列设置')}</div> : null,
}));

vi.mock('../AuditDetailsModal', () => ({ default: () => null }));

import AuditPanel from '../AuditPanel';

describe('AuditPanel usage-log layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuditLogsMock.mockResolvedValue({
      items: [
        {
          event_id: 'event-1',
          created_at: 1794701000,
          user_id: 7,
          username: 'alice',
          category: 'security',
          success: true,
          content: 'Account binding',
          other: {
            op: { action: 'user.binding_bind', params: { provider: 'oidc' } },
            admin_info: { auth_method: 'session' },
          },
        },
      ],
      total: 1,
    });
  });

  it('renders the responsive audit filters, selectable columns and shared pagination', async () => {
    render(<AuditPanel />);

    expect(await screen.findByText('Account binding')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('令牌标识')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请求 ID')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '操作码' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '方法' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '全部' })).toBeInTheDocument();
    expect(screen.getByTestId('pagination-area')).toHaveTextContent('显示第');

    fireEvent.click(screen.getByRole('button', { name: '紧凑列表' }));
    expect(
      screen.getByRole('button', { name: '自适应列表' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '列设置' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('列设置');
  });
});
