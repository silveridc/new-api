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

import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Typography } from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { CHART_CONFIG } from '../../constants';
import {
  buildModelHistoryValues,
  buildVendorShareValues,
  formatSharePct,
  formatTokenCount,
} from '../../services/rankings';

const { Title } = Typography;

// 图表容器固定高度，避免 Tabs 切换时高度塌陷。
const CHART_HEIGHT = 320;

// 与 helpers/render.jsx 的 baseColors 保持一致的 10 色序列。
const TREND_PALETTE = [
  '#1664FF',
  '#1AC6FF',
  '#FF8A00',
  '#3CC780',
  '#7442D4',
  '#FFC400',
  '#304D77',
  '#B48DEB',
  '#009488',
  '#FF7DDA',
];

// 底部类目轴：标签过密时自动隐藏/截断。每次新建，避免两个 spec 共享同一对象。
const createBottomAxis = () => ({
  orient: 'bottom',
  type: 'band',
  label: { autoHide: true, autoLimit: true },
  tick: { visible: false },
});

function ChartBlock({ title, spec }) {
  const { t } = useTranslation();
  const valuesLength = spec?.data?.[0]?.values?.length || 0;

  return (
    <div>
      <Title heading={6} style={{ marginBottom: 8 }}>
        {title}
      </Title>
      <div style={{ height: CHART_HEIGHT, width: '100%' }}>
        {spec ? (
          <VChart
            key={`${title}-${valuesLength}`}
            spec={spec}
            option={CHART_CONFIG}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description={t('当前时间范围内暂无数据')} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 排行榜「趋势」页：模型 Tokens 堆叠柱 + 厂商份额 100% 堆叠面积图。
 * 数据契约见 services/rankings.js；系列仅取 total 最高的前 N 个。
 */
export default function RankingTrendCharts({
  modelsHistory,
  vendorShareHistory,
}) {
  const { t } = useTranslation();

  // 复用 classic 图表的 Semi 主题；榜单页不经过 dashboard 的 useDashboardCharts，
  // 需要自行初始化一次。
  useEffect(() => {
    initVChartSemiTheme({ isWatchingThemeSwitch: true });
  }, []);

  const modelValues = useMemo(
    () => buildModelHistoryValues(modelsHistory),
    [modelsHistory],
  );
  const vendorValues = useMemo(
    () => buildVendorShareValues(vendorShareHistory),
    [vendorShareHistory],
  );

  const modelSpec = useMemo(() => {
    if (!modelValues.length) return null;
    return {
      type: 'bar',
      data: [{ id: 'models-history', values: modelValues }],
      xField: 'label',
      yField: 'tokens',
      seriesField: 'model',
      stack: true,
      legends: { visible: true, orient: 'bottom' },
      axes: [
        createBottomAxis(),
        {
          orient: 'left',
          type: 'linear',
          label: {
            formatMethod: (value) => formatTokenCount(Number(value)),
          },
        },
      ],
      bar: { state: { hover: { stroke: '#000', lineWidth: 1 } } },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => String(datum?.model ?? ''),
              value: (datum) => formatTokenCount(Number(datum?.tokens) || 0),
            },
          ],
        },
        dimension: {
          title: { value: (datum) => String(datum?.label ?? '') },
          content: [
            {
              key: (datum) => String(datum?.model ?? ''),
              value: (datum) => Number(datum?.tokens) || 0,
            },
          ],
          updateContent: (array) => {
            const sorted = [...array].sort(
              (a, b) => Number(b.value) - Number(a.value),
            );
            const total = sorted.reduce(
              (sum, item) => sum + (Number(item.value) || 0),
              0,
            );
            const rows = sorted.map((item) => ({
              key: item.key,
              value: formatTokenCount(Number(item.value) || 0),
            }));
            rows.unshift({ key: t('总计'), value: formatTokenCount(total) });
            return rows;
          },
        },
      },
      color: { type: 'ordinal', range: TREND_PALETTE },
      animationAppear: { duration: 500 },
    };
  }, [modelValues, t]);

  const vendorSpec = useMemo(() => {
    if (!vendorValues.length) return null;
    return {
      type: 'area',
      data: [{ id: 'vendor-share', values: vendorValues }],
      xField: 'label',
      yField: 'share',
      seriesField: 'vendor',
      stack: true,
      // 只取前 N 个厂商后各 ts 的 share 之和可能小于 1，percent 让每层归一化到 100%。
      percent: true,
      legends: { visible: true, orient: 'bottom' },
      axes: [
        createBottomAxis(),
        {
          orient: 'left',
          type: 'linear',
          min: 0,
          max: 1,
          label: {
            formatMethod: (value) => `${Math.round(Number(value) * 100)}%`,
          },
        },
      ],
      area: { style: { fillOpacity: 0.85 } },
      line: { style: { lineWidth: 1 } },
      point: { visible: false },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum) => String(datum?.vendor ?? ''),
              value: (datum) =>
                `${formatSharePct(Number(datum?.share) || 0)} · ${formatTokenCount(
                  Number(datum?.tokens) || 0,
                )}`,
            },
          ],
        },
        dimension: {
          title: { value: (datum) => String(datum?.label ?? '') },
          content: [
            {
              key: (datum) => String(datum?.vendor ?? ''),
              value: (datum) => Number(datum?.share) || 0,
            },
          ],
          updateContent: (array) =>
            [...array]
              .filter((item) => Number(item.value) > 0.0005)
              .sort((a, b) => Number(b.value) - Number(a.value))
              .map((item) => ({
                key: item.key,
                value: formatSharePct(Number(item.value) || 0),
              })),
        },
      },
      color: { type: 'ordinal', range: TREND_PALETTE },
      animationAppear: { duration: 500 },
    };
  }, [vendorValues]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ChartBlock title={t('模型 Tokens 用量趋势')} spec={modelSpec} />
      <ChartBlock title={t('厂商份额趋势')} spec={vendorSpec} />
    </div>
  );
}
