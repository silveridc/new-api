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

import React, { useEffect, useMemo, useState } from 'react';
import { Select, Spin, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';

const RANGE_OPTIONS = [
  { value: 24, label: '24 小时' },
  { value: 24 * 7, label: '7 天' },
];

function formatLatency(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * 每个模型在统计窗口内的平均请求耗时，数据来自 /api/perf-metrics/summary。
 */
const ModelLatencyPanel = ({ t }) => {
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await API.get('/api/perf-metrics/summary', {
          params: { hours },
        });
        if (cancelled) return;
        if (!res.data?.success) {
          showError(res.data?.message || t('获取模型耗时失败'));
          setRows([]);
          return;
        }
        const models = res.data.data?.models || [];
        setRows(
          models
            .filter((item) => item.avg_latency_ms > 0)
            .sort((a, b) => b.avg_latency_ms - a.avg_latency_ms),
        );
      } catch (error) {
        if (!cancelled) {
          showError(
            error.response?.data?.message || t('获取模型耗时失败'),
          );
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [hours, t]);

  const maxLatency = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.avg_latency_ms), 0),
    [rows],
  );

  const columns = useMemo(
    () => [
      {
        title: t('模型'),
        dataIndex: 'model_name',
        ellipsis: true,
        render: (value) => (
          <Typography.Text ellipsis={{ showTooltip: true }}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: t('平均耗时'),
        dataIndex: 'avg_latency_ms',
        width: 220,
        render: (value) => (
          <div className='flex items-center gap-2'>
            <div className='h-2 flex-1 rounded bg-slate-100 dark:bg-slate-700 overflow-hidden'>
              <div
                className='h-full rounded bg-slate-500 dark:bg-slate-400'
                style={{
                  width: `${maxLatency ? Math.max(4, (value / maxLatency) * 100) : 0}%`,
                }}
              />
            </div>
            <span className='font-mono text-xs w-16 text-right'>
              {formatLatency(value)}
            </span>
          </div>
        ),
      },
      {
        title: t('成功率'),
        dataIndex: 'success_rate',
        width: 90,
        render: (value) => (
          <Tag
            size='small'
            color={
              value >= 99 ? 'green' : value >= 90 ? 'orange' : 'red'
            }
          >
            {(value ?? 0).toFixed(1)}%
          </Tag>
        ),
      },
      {
        title: 'TPS',
        dataIndex: 'avg_tps',
        width: 90,
        render: (value) => (
          <span className='font-mono text-xs'>
            {value > 0 ? value.toFixed(1) : '—'}
          </span>
        ),
      },
    ],
    [maxLatency, t],
  );

  return (
    <div className='p-2'>
      <div className='flex items-center justify-between mb-2'>
        <Typography.Text type='tertiary' className='text-xs'>
          {t('统计窗口内每个模型的平均请求耗时')}
        </Typography.Text>
        <Select
          size='small'
          style={{ width: 110 }}
          value={hours}
          optionList={RANGE_OPTIONS.map((option) => ({
            ...option,
            label: t(option.label),
          }))}
          onChange={setHours}
        />
      </div>
      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={rows}
          rowKey='model_name'
          size='small'
          pagination={false}
          empty={t('暂无模型耗时数据')}
          scroll={{ y: 300 }}
        />
      </Spin>
    </div>
  );
};

export default ModelLatencyPanel;
