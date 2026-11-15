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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Tabs, Tag, Typography } from '@douyinfe/semi-ui';

import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import CompactModeToggle from '../../components/common/ui/CompactModeToggle';
import EmptyState from '../../components/common/EmptyState';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { useTableCompactMode } from '../../hooks/common/useTableCompactMode';
import {
  auditFormValuesToQuery,
  buildAuditQueryParams,
  getAuditLogs,
  getAuditListFields,
  DEFAULT_AUDIT_PAGE_SIZE,
} from '../../services/auditLogs';
import {
  getTodayStartTimestamp,
  isAdmin,
  timestamp2string,
} from '../../helpers';
import { createCardProPagination } from '../../helpers/utils';
import AuditColumnSelectorModal from './AuditColumnSelectorModal';
import AuditDetailsModal from './AuditDetailsModal';
import AuditFilters from './AuditFilters';

const AUDIT_COLUMNS = {
  TIME: 'created_at',
  USER: 'username',
  ACTION: 'action',
  EVENT: 'content',
  VERIFICATION: 'verification',
  CATEGORY: 'category',
  IP: 'ip',
  REQUEST: 'request',
  USER_AGENT: 'user_agent',
  SUCCESS: 'success',
  DETAILS: 'details',
};

const getDefaultAuditColumns = (canReadAll) => ({
  [AUDIT_COLUMNS.TIME]: true,
  [AUDIT_COLUMNS.USER]: canReadAll,
  [AUDIT_COLUMNS.ACTION]: true,
  [AUDIT_COLUMNS.EVENT]: true,
  [AUDIT_COLUMNS.VERIFICATION]: true,
  [AUDIT_COLUMNS.CATEGORY]: true,
  [AUDIT_COLUMNS.IP]: true,
  [AUDIT_COLUMNS.REQUEST]: true,
  [AUDIT_COLUMNS.USER_AGENT]: false,
  [AUDIT_COLUMNS.SUCCESS]: true,
  [AUDIT_COLUMNS.DETAILS]: true,
});

/**
 * 审计页。移植自新版 web/src/features/usage-logs/audit/。
 * 端点：GET /api/audit（管理员）、GET /api/audit/self（个人），
 * 筛选参数以 controller/access_token.go GetAuditLogs 为准。
 */
const AuditPanel = () => {
  const { t } = useTranslation();
  const canReadAll = useMemo(() => isAdmin(), []);
  const storageKey = canReadAll
    ? 'audit-table-columns-admin'
    : 'audit-table-columns-user';
  const [scope, setScope] = useState(canReadAll ? 'all' : 'self');
  const [formApi, setFormApi] = useState(null);
  const [formInitValues] = useState(() => ({
    dateRange: [
      timestamp2string(getTodayStartTimestamp()),
      timestamp2string(Math.floor(Date.now() / 1000)),
    ],
    success: 'all',
    category: 'all',
    username: '',
    token_ref: '',
    request_id: '',
  }));
  const [applied, setApplied] = useState(() => {
    const { p, page_size, ...params } = auditFormValuesToQuery(formInitValues);
    return params;
  });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_AUDIT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidRange, setInvalidRange] = useState(false);
  const [detail, setDetail] = useState(null);
  const [columnSelectorVisible, setColumnSelectorVisible] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [compactMode, setCompactMode] = useTableCompactMode('audit');
  const isMobile = useIsMobile();
  const effectiveScope = canReadAll && !accessRevoked ? scope : 'self';
  const defaultColumns = getDefaultAuditColumns(canReadAll);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved
        ? { ...getDefaultAuditColumns(canReadAll), ...JSON.parse(saved) }
        : getDefaultAuditColumns(canReadAll);
    } catch {
      return getDefaultAuditColumns(canReadAll);
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
  }, [storageKey, visibleColumns]);

  const load = useCallback(
    async (nextPage, nextPageSize, params) => {
      setLoading(true);
      setError('');
      try {
        const query = buildAuditQueryParams({
          ...params,
          p: nextPage,
          page_size: nextPageSize,
        });
        const result = await getAuditLogs(effectiveScope, query);
        setItems(result.items);
        setTotal(result.total);
        setPage(nextPage);
        setPageSize(nextPageSize);
      } catch (loadError) {
        if (effectiveScope === 'all' && loadError?.status === 403) {
          setAccessRevoked(true);
          setScope('self');
        }
        setError(loadError.message);
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [effectiveScope],
  );

  useEffect(() => {
    load(1, pageSize, applied);
    // Loading is intentionally triggered only when the active audit scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScope]);

  const handleSearch = () => {
    const values = formApi?.getValues() || formInitValues;
    const range = Array.isArray(values.dateRange) ? values.dateRange : [];
    const start = range[0] ? new Date(range[0]).getTime() : NaN;
    const end = range[1] ? new Date(range[1]).getTime() : NaN;
    if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
      setInvalidRange(true);
      return;
    }
    setInvalidRange(false);
    const params = auditFormValuesToQuery(values);
    setApplied(params);
    load(1, pageSize, params);
  };

  const handleReset = () => {
    formApi?.reset();
    setInvalidRange(false);
    const params = auditFormValuesToQuery(formInitValues);
    setApplied(params);
    load(1, pageSize, params);
  };

  const columns = useMemo(() => {
    const list = [
      {
        key: AUDIT_COLUMNS.TIME,
        title: t('时间'),
        dataIndex: 'created_at',
        width: 160,
        fixed: 'left',
        render: (value) => (
          <span className='font-mono text-xs'>
            {value ? timestamp2string(value) : '-'}
          </span>
        ),
      },
    ];
    if (effectiveScope === 'all') {
      list.push({
        key: AUDIT_COLUMNS.USER,
        title: t('用户'),
        dataIndex: 'username',
        width: 105,
        render: (value, record) => (
          <span>
            {value || '-'}
            {record.user_id ? (
              <Typography.Text type='tertiary' size='small'>
                {' '}
                (#{record.user_id})
              </Typography.Text>
            ) : null}
          </span>
        ),
      });
    }
    list.push(
      {
        key: AUDIT_COLUMNS.ACTION,
        title: t('操作码'),
        dataIndex: 'action',
        width: 130,
        ellipsis: true,
        render: (value, record) => {
          const action = value || getAuditListFields(record).action;
          return action ? (
            <Tag size='small' color='white' className='font-mono text-xs'>
              {action}
            </Tag>
          ) : (
            '-'
          );
        },
      },
      {
        key: AUDIT_COLUMNS.EVENT,
        title: t('事件'),
        dataIndex: 'content',
        ellipsis: true,
        minWidth: 180,
        render: (value, record) => (
          <Typography.Text ellipsis={{ showTooltip: true }}>
            {value || getAuditListFields(record).action || '-'}
          </Typography.Text>
        ),
      },
      {
        key: AUDIT_COLUMNS.VERIFICATION,
        title: t('方法'),
        dataIndex: 'verification_method',
        width: 90,
        ellipsis: true,
        render: (_, record) => {
          const fields = getAuditListFields(record);
          const method = fields.verificationMethod || fields.loginMethod;
          if (!method) return '—';
          return fields.provider && !fields.loginMethod
            ? `${method} · ${fields.provider}`
            : method;
        },
      },
      {
        key: AUDIT_COLUMNS.CATEGORY,
        title: t('分类'),
        dataIndex: 'category',
        width: 90,
        render: (value) => <Tag size='small'>{value || '-'}</Tag>,
      },
      {
        key: AUDIT_COLUMNS.IP,
        title: 'IP',
        dataIndex: 'ip',
        width: 125,
        render: (value) => (
          <span className='font-mono text-xs'>{value || '—'}</span>
        ),
      },
      {
        key: AUDIT_COLUMNS.REQUEST,
        title: t('请求'),
        dataIndex: 'route',
        ellipsis: true,
        minWidth: 200,
        render: (_, record) => {
          const fields = getAuditListFields(record);
          const method = fields.requestMethod || record.method || '';
          const route = fields.requestRoute || record.route || '';
          const status = fields.status || record.status || '';
          return (
            <Typography.Text
              ellipsis={{ showTooltip: true }}
              className='text-xs'
            >
              <span className='font-mono'>{method}</span> {route}
              {status ? ` (${status})` : ''}
            </Typography.Text>
          );
        },
      },
      {
        key: AUDIT_COLUMNS.USER_AGENT,
        title: 'User-Agent',
        dataIndex: 'user_agent',
        width: 210,
        ellipsis: true,
        render: (_, record) => {
          const userAgent =
            getAuditListFields(record).userAgent || record.user_agent;
          return userAgent ? (
            <Typography.Text
              ellipsis={{ showTooltip: true }}
              className='text-xs'
            >
              {userAgent}
            </Typography.Text>
          ) : (
            '—'
          );
        },
      },
      {
        key: AUDIT_COLUMNS.SUCCESS,
        title: t('结果'),
        dataIndex: 'success',
        width: 90,
        render: (value) => {
          if (typeof value !== 'boolean') return '—';
          return value ? (
            <Tag color='green' size='small'>
              {t('成功')}
            </Tag>
          ) : (
            <Tag color='red' size='small'>
              {t('失败')}
            </Tag>
          );
        },
      },
      {
        key: AUDIT_COLUMNS.DETAILS,
        title: t('详情'),
        dataIndex: 'details',
        width: 80,
        fixed: 'right',
        render: (_, record) => (
          <Button
            size='small'
            theme='borderless'
            onClick={() => setDetail(record)}
          >
            {t('查看')}
          </Button>
        ),
      },
    );
    return list;
  }, [effectiveScope, t]);

  const tableColumns = useMemo(
    () =>
      columns
        .filter((column) => visibleColumns[column.key])
        .map((column) => {
          if (!compactMode || !column.fixed) return column;
          const { fixed, ...rest } = column;
          return rest;
        }),
    [columns, compactMode, visibleColumns],
  );

  const handleColumnVisibilityChange = (key, checked) => {
    setVisibleColumns((previous) => ({ ...previous, [key]: checked }));
  };

  const handleSelectAllColumns = (checked) => {
    setVisibleColumns((previous) => ({
      ...previous,
      ...Object.fromEntries(columns.map((column) => [column.key, checked])),
    }));
  };

  return (
    <>
      <AuditColumnSelectorModal
        visible={columnSelectorVisible}
        onClose={() => setColumnSelectorVisible(false)}
        columns={columns}
        visibleColumns={visibleColumns}
        canReadAll={canReadAll}
        onColumnVisibilityChange={handleColumnVisibilityChange}
        onSelectAll={handleSelectAllColumns}
        onReset={() => setVisibleColumns(defaultColumns)}
        t={t}
      />
      <CardPro
        type='type2'
        statsArea={
          <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
            <div className='flex flex-wrap items-center gap-2'>
              {canReadAll && !accessRevoked ? (
                <Tabs type='button' activeKey={scope} onChange={setScope}>
                  <Tabs.TabPane tab={t('全部')} itemKey='all' />
                  <Tabs.TabPane tab={t('仅我的')} itemKey='self' />
                </Tabs>
              ) : null}
            </div>
            <CompactModeToggle
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              t={t}
            />
          </div>
        }
        searchArea={
          <AuditFilters
            formInitValues={formInitValues}
            setFormApi={setFormApi}
            onSubmit={handleSearch}
            onReset={handleReset}
            onOpenColumnSelector={() => setColumnSelectorVisible(true)}
            loading={loading}
            canReadAll={effectiveScope === 'all'}
            t={t}
          />
        }
        paginationArea={createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: (nextPage) => load(nextPage, pageSize, applied),
          onPageSizeChange: (nextSize) => load(1, nextSize, applied),
          isMobile,
          pageSizeOpts: [10, 20, 50, 100],
          t,
        })}
        t={t}
      >
        {accessRevoked && (
          <Banner
            type='info'
            closeIcon={null}
            description={t('审计权限已变更，当前仅展示你自己的记录。')}
            className='mx-3 mt-3'
          />
        )}
        {invalidRange && (
          <Banner
            type='danger'
            closeIcon={null}
            description={t('结束时间必须晚于开始时间')}
            className='mx-3 mt-3'
          />
        )}
        {error && (
          <Banner
            type='danger'
            closeIcon={null}
            description={error}
            className='mx-3 mt-3'
          />
        )}
        <CardTable
          columns={tableColumns}
          dataSource={items}
          rowKey='event_id'
          loading={loading}
          size='small'
          tableLayout='fixed'
          scroll={compactMode ? undefined : { x: 'max-content' }}
          empty={<EmptyState />}
          hidePagination
          className='overflow-hidden'
        />
      </CardPro>
      <AuditDetailsModal
        entry={detail}
        visible={!!detail}
        onClose={() => setDetail(null)}
      />
    </>
  );
};

export default AuditPanel;
