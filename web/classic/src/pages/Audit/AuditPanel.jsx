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
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  DatePicker,
  Input,
  Select,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { Search, RotateCcw } from 'lucide-react';

import {
  buildAuditQueryParams,
  getAuditLogs,
  AUDIT_CATEGORIES,
  DEFAULT_AUDIT_PAGE_SIZE,
} from '../../services/auditLogs';
import { isAdmin, timestamp2string } from '../../helpers';
import AuditDetailsModal from './AuditDetailsModal';

const SUCCESS_OPTIONS = [
  { value: 'all', label: '全部结果' },
  { value: 'true', label: '成功' },
  { value: 'false', label: '失败' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: '全部分类' },
  ...AUDIT_CATEGORIES,
];

const EMPTY_FILTERS = {
  start_timestamp: undefined,
  end_timestamp: undefined,
  success: 'all',
  category: 'all',
  username: '',
  token_ref: '',
  request_id: '',
};

/**
 * 审计页。移植自新版 web/src/features/usage-logs/audit/。
 * 端点：GET /api/audit（管理员）、GET /api/audit/self（个人），
 * 筛选参数以 controller/access_token.go GetAuditLogs 为准。
 */
const AuditPanel = () => {
  const { t } = useTranslation();
  const canReadAll = useMemo(() => isAdmin(), []);

  const [scope, setScope] = useState(canReadAll ? 'all' : 'self');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState({});
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_AUDIT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [accessRevoked, setAccessRevoked] = useState(false);

  const effectiveScope = canReadAll && !accessRevoked ? scope : 'self';

  const load = useCallback(
    async (nextPage = page, nextPageSize = pageSize, params = applied) => {
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
        // 403：管理员审计权限被收回，回退到仅本人视图
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
    [applied, effectiveScope, page, pageSize],
  );

  useEffect(() => {
    load(1, pageSize, {});
    setApplied({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScope]);

  const handleSearch = () => {
    const params = buildAuditQueryParams(filters);
    const { p, page_size, ...rest } = params;
    setApplied(rest);
    load(1, pageSize, rest);
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setApplied({});
    load(1, pageSize, {});
  };

  const handleDateRange = (dates) => {
    if (!dates || dates.length !== 2) {
      setFilters((prev) => ({
        ...prev,
        start_timestamp: undefined,
        end_timestamp: undefined,
      }));
      return;
    }
    setFilters((prev) => ({
      ...prev,
      start_timestamp: Math.floor(new Date(dates[0]).getTime() / 1000),
      end_timestamp: Math.floor(new Date(dates[1]).getTime() / 1000),
    }));
  };

  const invalidRange =
    filters.start_timestamp !== undefined &&
    filters.end_timestamp !== undefined &&
    filters.start_timestamp > filters.end_timestamp;

  const columns = useMemo(() => {
    const list = [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        width: 170,
        render: (value) => (
          <span className='font-mono text-xs'>
            {value ? timestamp2string(value) : '-'}
          </span>
        ),
      },
    ];
    if (effectiveScope === 'all') {
      list.push({
        title: t('用户'),
        dataIndex: 'username',
        width: 110,
        render: (value, record) => (
          <span>
            {value || '-'}
            {record.actor_role ? (
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
        title: t('事件'),
        dataIndex: 'content',
        render: (value, record) => (
          <Typography.Text
            ellipsis={{ showTooltip: true }}
            style={{ maxWidth: 320 }}
          >
            {value || record.action || '-'}
          </Typography.Text>
        ),
      },
      {
        title: t('分类'),
        dataIndex: 'category',
        width: 100,
        render: (value) => <Tag size='small'>{value || '-'}</Tag>,
      },
      {
        title: 'IP',
        dataIndex: 'ip',
        width: 120,
        render: (value) => (
          <span className='font-mono text-xs'>{value || '—'}</span>
        ),
      },
      {
        title: t('方法'),
        dataIndex: 'method',
        width: 80,
        render: (value) => (
          <span className='font-mono text-xs'>{value || '—'}</span>
        ),
      },
      {
        title: t('路由'),
        dataIndex: 'route',
        width: 200,
        render: (value) => (
          <Typography.Text
            mono
            ellipsis={{ showTooltip: true }}
            style={{ maxWidth: 200 }}
          >
            {value || '—'}
          </Typography.Text>
        ),
      },
      {
        title: 'HTTP',
        dataIndex: 'status',
        width: 70,
        render: (value) => (
          <span className='font-mono text-xs'>{value || '—'}</span>
        ),
      },
      {
        title: t('结果'),
        dataIndex: 'success',
        width: 80,
        render: (value) =>
          value ? (
            <Tag color='green' size='small'>
              {t('成功')}
            </Tag>
          ) : (
            <Tag color='red' size='small'>
              {t('失败')}
            </Tag>
          ),
      },
      {
        title: t('详情'),
        dataIndex: 'details',
        width: 80,
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

  return (
    <div className='flex flex-col gap-3'>
      {canReadAll && !accessRevoked ? (
        <Tabs
          type='button'
          activeKey={scope}
          onChange={(key) => setScope(key)}
        >
          <Tabs.TabPane tab={t('全部')} itemKey='all' />
          <Tabs.TabPane tab={t('仅我的')} itemKey='self' />
        </Tabs>
      ) : null}
      {accessRevoked ? (
        <Banner
          type='info'
          closeIcon={null}
          description={t('审计权限已变更，当前仅展示你自己的记录。')}
        />
      ) : null}

      <div className='flex flex-wrap items-center gap-2'>
        <DatePicker
          type='dateTimeRange'
          style={{ width: 360 }}
          placeholder={[t('开始时间'), t('结束时间')]}
          onChange={handleDateRange}
        />
        <Select
          style={{ width: 130 }}
          value={filters.success}
          onChange={(value) =>
            setFilters((prev) => ({ ...prev, success: value }))
          }
          optionList={SUCCESS_OPTIONS.map((option) => ({
            ...option,
            label: t(option.label),
          }))}
        />
        <Select
          style={{ width: 130 }}
          value={filters.category}
          onChange={(value) =>
            setFilters((prev) => ({ ...prev, category: value }))
          }
          optionList={CATEGORY_OPTIONS.map((option) => ({
            ...option,
            label: t(option.label),
          }))}
        />
        {effectiveScope === 'all' ? (
          <Input
            style={{ width: 150 }}
            placeholder={t('用户名')}
            value={filters.username}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, username: value }))
            }
          />
        ) : null}
        <Input
          style={{ width: 150 }}
          placeholder={t('令牌标识')}
          value={filters.token_ref}
          onChange={(value) =>
            setFilters((prev) => ({ ...prev, token_ref: value }))
          }
        />
        <Input
          style={{ width: 150 }}
          placeholder={t('请求 ID')}
          value={filters.request_id}
          onChange={(value) =>
            setFilters((prev) => ({ ...prev, request_id: value }))
          }
        />
        <Button
          theme='solid'
          type='primary'
          icon={<Search size={14} />}
          loading={loading}
          disabled={invalidRange}
          onClick={handleSearch}
        >
          {t('查询')}
        </Button>
        <Button icon={<RotateCcw size={14} />} onClick={handleReset}>
          {t('重置')}
        </Button>
      </div>

      {invalidRange ? (
        <Banner
          type='danger'
          closeIcon={null}
          description={t('结束时间必须晚于开始时间')}
        />
      ) : null}
      {error ? (
        <Banner type='danger' closeIcon={null} description={error} />
      ) : null}

      <Table
        columns={columns}
        dataSource={items}
        rowKey='event_id'
        loading={loading}
        size='middle'
        scroll={{ x: 'max-content' }}
        empty={t('暂无审计记录')}
        pagination={{
          currentPage: page,
          pageSize,
          total,
          pageSizeOpts: [10, 20, 50, 100],
          showSizeChanger: true,
          onPageChange: (nextPage) => load(nextPage, pageSize),
          onPageSizeChange: (nextSize) => load(1, nextSize),
        }}
      />

      <AuditDetailsModal
        entry={detail}
        visible={!!detail}
        onClose={() => setDetail(null)}
      />
    </div>
  );
};

export default AuditPanel;
