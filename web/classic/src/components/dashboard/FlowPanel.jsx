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
import { Button, Card, Empty, Select, Spin, Tag, Typography } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { isRoot, renderQuota, showError } from '../../helpers';
import {
  buildFlowGraph,
  FLOW_STAGES,
  FLOW_STAGE_COLORS,
  FLOW_STAGE_LABELS,
  getFlowData,
  MIN_FLOW_STAGES,
} from '../../services/flow';

const { Text } = Typography;

const CHART_HEIGHT = 420;

// 时间范围与调用次数/消费指标切换
const RANGE_OPTIONS = [
  { value: 24, label: '近 24 小时', defaultTime: 'hour' },
  { value: 168, label: '近 7 天', defaultTime: 'day' },
  { value: 720, label: '近 30 天', defaultTime: 'day' },
];

/**
 * VChart sankey 的 datum 会把原始数据嵌套在 datum.datum（数组，按层级），
 * 样式回调需经此包装读取自定义字段。
 */
function datumSource(datum) {
  const nested = datum && datum.datum;
  if (Array.isArray(nested)) {
    const depth = Number(datum.depth) || 0;
    return nested[depth] || nested[0] || datum;
  }
  return nested || datum;
}

/** 桑基图 spec；values 由 buildFlowGraph 产出。 */
function buildSankeySpec(flow, t) {
  if (!flow.nodes.length || !flow.links.length) return null;
  const isQuota = flow.metric === 'quota';
  return {
    type: 'sankey',
    data: [
      {
        id: 'flow',
        values: [
          {
            nodes: flow.nodes.map((node) => ({
              key: node.key,
              name: node.name,
              kind: node.kind,
              value: node.value,
              color: FLOW_STAGE_COLORS[node.kind],
            })),
            links: flow.links.map((link) => ({
              source: link.source,
              target: link.target,
              value: link.value,
            })),
          },
        ],
      },
    ],
    categoryField: 'name',
    sourceField: 'source',
    targetField: 'target',
    valueField: 'value',
    nodeKey: 'key',
    direction: 'horizontal',
    nodeAlign: 'justify',
    nodeGap: 14,
    nodeWidth: 16,
    minLinkHeight: 2,
    minNodeHeight: 8,
    legends: { visible: false },
    label: {
      visible: true,
      position: 'outside',
      limit: 220,
      interactive: false,
      style: { fontSize: 11, fontWeight: 600 },
    },
    title: { visible: false },
    tooltip: {
      mark: {
        title: { value: (datum) => String(datum?.name ?? '') },
        content: [
          {
            key: isQuota ? t('消费') : t('调用次数'),
            value: (datum) =>
              isQuota ? renderQuota(Number(datum?.value) || 0, 6) : String(Number(datum?.value) || 0),
          },
        ],
      },
    },
    node: {
      interactive: true,
      style: {
        // VChart sankey 的 datum 把原始数据嵌套在 datum.datum[depth]，需包装读取
        fill: (datum) => String(datumSource(datum).color || '#475569'),
        fillOpacity: 0.92,
      },
    },
    link: {
      style: {
        fill: (datum) => String(datumSource(datum).linkColor || '#94a3b8'),
        fillOpacity: 0.28,
      },
    },
    animationAppear: { duration: 600 },
  };
}

/**
 * 流量分析（桑基图）。数据来自 /api/data/flow（管理员，含用户/节点维度）
 * 或 /api/data/flow/self（普通用户，令牌→分组→模型）。
 */
const FlowPanel = ({ t: tProp, isAdminUser = false }) => {
  const { t: tI18n } = useTranslation();
  const t = tProp || tI18n;
  // 角色决定桑基图阶段链：root 含节点维度，admin 不含用户/节点
  const flowRole = isAdminUser ? (isRoot() ? 'root' : 'admin') : 'user';

  const [rangeHours, setRangeHours] = useState(24);
  const [metric, setMetric] = useState('quota');
  const [hiddenStages, setHiddenStages] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // 初始化 Semi 主题（本组件不经 dashboard 的 useDashboardCharts）
  useEffect(() => {
    initVChartSemiTheme({ isWatchingThemeSwitch: true });
  }, []);

  const allStages = FLOW_STAGES[flowRole];
  const stages = useMemo(
    () => allStages.filter((stage) => !hiddenStages.includes(stage)),
    [allStages, hiddenStages],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - Number(rangeHours) * 3600;
      const defaultTime = rangeHours <= 24 ? 'hour' : 'day';
      const data = await getFlowData({
        isAdminUser,
        startTimestamp: start,
        endTimestamp: end,
        defaultTime,
      });
      setRows(data);
    } catch (error) {
      showError(error.message || t('获取流量数据失败'));
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeHours, isAdminUser, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const flow = useMemo(
    () => buildFlowGraph(rows, { stages, metric }),
    [rows, stages, metric],
  );

  const toggleStage = (stage) => {
    setHiddenStages((prev) => {
      const next = prev.includes(stage)
        ? prev.filter((item) => item !== stage)
        : [...prev, stage];
      // 桑基至少保留两列才能画出链路
      if (allStages.length - next.length < MIN_FLOW_STAGES) return prev;
      return next;
    });
  };

  const spec = useMemo(() => buildSankeySpec(flow, t), [flow, t]);

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('流量分析')}
        </div>
      }
      headerExtraContent={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Select
            value={metric}
            onChange={setMetric}
            optionList={[
              { value: 'quota', label: t('按消费') },
              { value: 'count', label: t('按调用次数') },
            ]}
            style={{ width: 120 }}
            size='small'
          />
          <Select
            value={rangeHours}
            onChange={setRangeHours}
            optionList={RANGE_OPTIONS.map((option) => ({
              ...option,
              label: t(option.label),
            }))}
            style={{ width: 120 }}
            size='small'
          />
          <Button size='small' icon={<IconRefresh />} loading={loading} onClick={loadData} />
        </div>
      }
    >
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {allStages.map((stage) => {
          const visible = !hiddenStages.includes(stage);
          return (
            <Tag
              key={stage}
              color={visible ? 'blue' : 'grey'}
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => toggleStage(stage)}
            >
              {t(FLOW_STAGE_LABELS[stage])}
            </Tag>
          );
        })}
        <Text type='tertiary' size='small' style={{ marginLeft: 4 }}>
          {t('点击阶段名可隐藏/显示；合计消费 {{quota}} · {{times}} 次调用', {
            quota: renderQuota(flow.summary.quota, 4),
            times: flow.summary.count,
          })}
        </Text>
      </div>
      <div style={{ height: CHART_HEIGHT }}>
        {spec ? (
          <VChart spec={spec} option={{ mode: 'desktop-browser' }} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description={t('当前时间范围内暂无调用数据')} />
          </div>
        )}
      </div>
    </Card>
  );
};

export default FlowPanel;
