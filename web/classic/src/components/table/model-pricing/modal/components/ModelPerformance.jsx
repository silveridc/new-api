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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Table, Tag, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

import AvailabilitySparkline from '../../../../common/ui/AvailabilitySparkline';
import {
  DEFAULT_PERF_HOURS,
  buildAvailabilityPoints,
  formatLatency,
  formatSuccessRate,
  formatTps,
  getPerfMetrics,
} from '../../../../../services/performance';

const { Text, Title } = Typography;

const statBlockStyle = {
  border: '1px solid var(--semi-color-border)',
  borderRadius: 8,
  padding: '10px 12px',
};

function Stat({ label, value, hint, color }) {
  return (
    <div style={statBlockStyle}>
      <Text type='tertiary' size='small'>
        {label}
      </Text>
      <div style={{ marginTop: 2 }}>
        <Text strong style={{ fontSize: 16, color }}>
          {value}
        </Text>
      </div>
      {hint && (
        <div>
          <Text type='tertiary' size='small'>
            {hint}
          </Text>
        </div>
      )}
    </div>
  );
}

/**
 * 模型近期性能（延迟 / 成功率 / 吞吐）。
 * 数据来自 GET /api/perf-metrics?model=X&hours=N（controller/perf_metrics.go:44-79），
 * 展示规则对齐新版
 * web/src/features/pricing/components/model-details-performance.tsx。
 */
export default function ModelPerformance({ modelName }) {
  const { t } = useTranslation();
  // 关闭抽屉或切换模型时丢弃在途响应，避免旧数据写入新模型。
  const requestSeqRef = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!modelName) {
      return undefined;
    }
    const reqSeq = (requestSeqRef.current += 1);
    setLoading(true);
    setData(null);
    getPerfMetrics(modelName, DEFAULT_PERF_HOURS)
      .then((result) => {
        if (reqSeq !== requestSeqRef.current) return;
        setData(result);
      })
      .catch(() => {
        if (reqSeq !== requestSeqRef.current) return;
        setData(null);
      })
      .finally(() => {
        if (reqSeq !== requestSeqRef.current) return;
        setLoading(false);
      });
    return () => {
      requestSeqRef.current += 1;
    };
  }, [modelName]);

  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const modelPoints = useMemo(
    () => buildAvailabilityPoints(data?.series),
    [data],
  );
  const availabilityLabel = t('近 {{hours}} 小时可用性', {
    hours: DEFAULT_PERF_HOURS,
  });

  const columns = useMemo(
    () => [
      {
        title: t('分组'),
        dataIndex: 'group',
        width: 110,
        render: (text) => (
          <Tag color='white' size='small' shape='circle'>
            {text}
          </Tag>
        ),
      },
      {
        title: t('平均 TPS'),
        dataIndex: 'avg_tps',
        width: 80,
        render: (text) => formatTps(text),
      },
      {
        title: t('平均延迟'),
        dataIndex: 'avg_latency_ms',
        width: 90,
        render: (text) => formatLatency(text),
      },
      {
        title: t('可用性'),
        dataIndex: 'series',
        render: (series, record) => (
          <AvailabilitySparkline
            size='sm'
            points={buildAvailabilityPoints(series)}
            overall={record?.success_rate}
            emptyLabel={t('暂无数据')}
            label={availabilityLabel}
          />
        ),
      },
    ],
    [t, availabilityLabel],
  );

  if (loading) {
    return (
      <div>
        <Title heading={6} style={{ marginBottom: 8 }}>
          {t('性能数据')}
        </Title>
        <Text type='tertiary' size='small'>
          {t('加载中...')}
        </Text>
      </div>
    );
  }

  const summary = data?.summary || null;
  if (!summary && groups.length === 0) {
    return (
      <div>
        <Title heading={6} style={{ marginBottom: 8 }}>
          {t('性能数据')}
        </Title>
        <Text type='tertiary' size='small'>
          {t('该模型暂无性能数据')}
        </Text>
      </div>
    );
  }

  const incidentCount = modelPoints.filter((point) => point.rate < 100).length;

  return (
    <div>
      <Title heading={6} style={{ marginBottom: 8 }}>
        {t('性能数据')}
      </Title>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Stat
          label={t('平均延迟')}
          value={formatLatency(summary?.avg_latency_ms)}
        />
        <Stat
          label={t('成功率')}
          value={summary ? formatSuccessRate(summary.success_rate) : '-'}
          hint={
            incidentCount > 0
              ? t('近 {{hours}} 小时内有 {{incidents}} 次异常', {
                  hours: DEFAULT_PERF_HOURS,
                  incidents: incidentCount,
                })
              : t('近 {{hours}} 小时内无异常', { hours: DEFAULT_PERF_HOURS })
          }
        />
        <Stat label={t('平均 TPS')} value={formatTps(summary?.avg_tps)} />
      </div>

      {modelPoints.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type='tertiary' size='small'>
            {availabilityLabel}
          </Text>
          <div style={{ marginTop: 4 }}>
            <AvailabilitySparkline
              points={modelPoints}
              overall={summary?.success_rate}
              emptyLabel={t('暂无数据')}
              label={availabilityLabel}
            />
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <Table
          size='small'
          columns={columns}
          dataSource={groups.map((group) => ({
            key: group?.group || '-',
            ...group,
          }))}
          pagination={false}
        />
      )}
    </div>
  );
}
