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

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  Col,
  Descriptions,
  Modal,
  Progress,
  Row,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import { isRoot, showError, showSuccess } from '../../helpers';
import {
  PERF_HOURS_OPTIONS,
  DEFAULT_PERF_HOURS,
  getPerfSummary,
  getPerformanceStats,
  clearDiskCache,
  resetPerformanceStats,
  forceGC,
  formatBytes,
  formatLatency,
  formatSuccessRate,
  formatTps,
  buildPerfModelRows,
} from '../../services/performance';

const { Text, Title } = Typography;

function MetricCard({ label, value, extra, tagColor }) {
  return (
    <Card bodyStyle={{ padding: 16 }}>
      <Text type='tertiary' size='small'>
        {label}
      </Text>
      <div style={{ marginTop: 6 }}>
        <Title heading={3} style={{ margin: 0 }}>
          {value}
        </Title>
      </div>
      {extra ? (
        <div style={{ marginTop: 6 }}>
          <Tag color={tagColor || 'grey'}>{extra}</Tag>
        </div>
      ) : null}
    </Card>
  );
}

function usageProgress(percent) {
  if (percent === null || percent === undefined || Number.isNaN(percent)) {
    return '-';
  }
  const clamped = Math.min(100, Math.max(0, Number(percent)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Progress percent={clamped} showInfo={false} style={{ width: 90 }} />
      <Text size='small'>{clamped.toFixed(1)}%</Text>
    </div>
  );
}

function SystemPerformanceSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPerformanceStats();
      setStats(data);
    } catch (error) {
      showError(error.message || t('获取系统性能数据失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const runAction = (action, successMessage) => {
    Modal.confirm({
      title: t('确认执行'),
      content: successMessage,
      onOk: async () => {
        try {
          const message = await action();
          showSuccess(message || t('操作成功'));
          await loadStats();
        } catch (error) {
          showError(error.message || t('操作失败'));
        }
      },
    });
  };

  const memory = stats?.memory_stats || {};
  const diskCache = stats?.disk_cache_info || {};
  const diskSpace = stats?.disk_space_info || {};
  const config = stats?.config || {};

  return (
    <Card
      title={t('系统性能（Root）')}
      style={{ marginTop: 12 }}
      headerExtraContent={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size='small'
            onClick={() =>
              runAction(clearDiskCache, t('清理 10 分钟未使用的磁盘缓存文件。'))
            }
          >
            {t('清理磁盘缓存')}
          </Button>
          <Button
            size='small'
            onClick={() => runAction(resetPerformanceStats, t('重置缓存统计。'))}
          >
            {t('重置统计')}
          </Button>
          <Button
            size='small'
            onClick={() => runAction(forceGC, t('立即触发一次 Go GC。'))}
          >
            {t('强制 GC')}
          </Button>
          <Button size='small' icon={<IconRefresh />} onClick={loadStats}>
            {t('刷新')}
          </Button>
        </div>
      }
    >
      <Spin spinning={loading}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Descriptions
              size='small'
              row
              data={[
                { key: t('已分配内存'), value: formatBytes(memory.alloc) },
                { key: t('累计分配'), value: formatBytes(memory.total_alloc) },
                { key: t('系统占用'), value: formatBytes(memory.sys) },
                { key: t('GC 次数'), value: memory.num_gc ?? '-' },
                {
                  key: t('Goroutine'),
                  value: memory.num_goroutine ?? '-',
                },
              ]}
            />
          </Col>
          <Col xs={24} md={8}>
            <Descriptions
              size='small'
              row
              data={[
                { key: t('缓存目录'), value: diskCache.path || '-' },
                { key: t('目录存在'), value: diskCache.exists ? t('是') : t('否') },
                { key: t('文件数'), value: diskCache.file_count ?? '-' },
                { key: t('总大小'), value: formatBytes(diskCache.total_size) },
                { key: t('磁盘使用率'), value: usageProgress(diskSpace.used_percent) },
              ]}
            />
          </Col>
          <Col xs={24} md={8}>
            <Descriptions
              size='small'
              row
              data={[
                {
                  key: t('磁盘缓存'),
                  value: config.disk_cache_enabled ? t('已启用') : t('已停用'),
                },
                {
                  key: t('阈值 / 上限（MB）'),
                  value: `${config.disk_cache_threshold_mb ?? '-'} / ${
                    config.disk_cache_max_size_mb ?? '-'
                  }`,
                },
                {
                  key: t('性能监控'),
                  value: config.monitor_enabled ? t('已启用') : t('已停用'),
                },
                {
                  key: t('CPU/内存/磁盘阈值（%）'),
                  value: `${config.monitor_cpu_threshold ?? '-'} / ${
                    config.monitor_memory_threshold ?? '-'
                  } / ${config.monitor_disk_threshold ?? '-'}`,
                },
                {
                  key: t('容器运行'),
                  value: config.is_running_in_container ? t('是') : t('否'),
                },
              ]}
            />
          </Col>
        </Row>
      </Spin>
    </Card>
  );
}

export default function Performance() {
  const { t } = useTranslation();
  const [hours, setHours] = useState(DEFAULT_PERF_HOURS);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);

  const loadSummary = useCallback(async (nextHours) => {
    setLoading(true);
    try {
      const data = await getPerfSummary(nextHours);
      setSummary(data?.summary || null);
      setRows(buildPerfModelRows(data?.models));
    } catch (error) {
      setSummary(null);
      setRows([]);
      showError(error.message || t('获取模型性能数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(hours);
  }, [hours, loadSummary]);

  const columns = [
    {
      title: t('模型'),
      dataIndex: 'model_name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: t('平均延迟'),
      dataIndex: 'latency_label',
      sorter: (a, b) => a.avg_latency_ms - b.avg_latency_ms,
    },
    {
      title: t('成功率'),
      dataIndex: 'success_rate_label',
      sorter: (a, b) => a.success_rate - b.success_rate,
    },
    {
      title: t('平均 TPS'),
      dataIndex: 'tps_label',
      sorter: (a, b) => a.avg_tps - b.avg_tps,
    },
  ];

  return (
    <div className='mt-[60px] px-2 pb-6'>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={16}>
          <Title heading={4}>{t('模型性能')}</Title>
          <Text type='tertiary' size='small'>
            {t('基于近期请求采样的延迟、成功率与吞吐统计。')}
          </Text>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Select
              value={hours}
              onChange={(value) => setHours(value)}
              optionList={PERF_HOURS_OPTIONS.map((o) => ({
                ...o,
                label: t(o.label),
              }))}
              style={{ width: 140 }}
              aria-label={t('时间范围')}
            />
            <Button
              icon={<IconRefresh />}
              loading={loading}
              onClick={() => loadSummary(hours)}
            >
              {t('刷新')}
            </Button>
          </div>
        </Col>
      </Row>

      <Banner
        fullMode={false}
        type='info'
        style={{ marginBottom: 12 }}
        description={t(
          '统计按小时分桶聚合；成功率为非 5xx 响应占比，TPS 为输出 Tokens 每秒均值。',
        )}
      />

      <Spin spinning={loading}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <MetricCard
              label={t('全站平均延迟')}
              value={formatLatency(summary?.avg_latency_ms)}
              extra={t('所有模型加权')}
              tagColor='blue'
            />
          </Col>
          <Col xs={24} sm={8}>
            <MetricCard
              label={t('全站成功率')}
              value={formatSuccessRate(summary?.success_rate)}
              extra={t('所有模型加权')}
              tagColor='green'
            />
          </Col>
          <Col xs={24} sm={8}>
            <MetricCard
              label={t('全站平均 TPS')}
              value={formatTps(summary?.avg_tps)}
              extra={t('所有模型加权')}
              tagColor='cyan'
            />
          </Col>
        </Row>

        <Card title={t('模型明细')} style={{ marginTop: 12 }}>
          <Table
            columns={columns}
            dataSource={rows}
            rowKey='key'
            loading={loading}
            pagination={rows.length > 10 ? { pageSize: 10 } : false}
            size='small'
          />
        </Card>

        {isRoot() ? <SystemPerformanceSection /> : null}
      </Spin>
    </div>
  );
}
