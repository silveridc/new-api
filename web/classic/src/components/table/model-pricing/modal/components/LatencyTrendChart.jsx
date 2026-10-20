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
import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';

import { formatLatency } from '../../../../../services/performance';

const { Text } = Typography;

// 容器固定高度，避免抽屉展开动画期间高度塌陷。
const CHART_HEIGHT = 220;

/**
 * 平均首 Token 延迟趋势。数据来自 GET /api/perf-metrics 的模型级 series，
 * 图形对齐新版 web/src/features/pricing/components/model-details-charts.tsx
 * 的 LatencyTrendChart（类目轴 + HH:mm 刻度）。
 */
export default function LatencyTrendChart({ points, title }) {
  const { t } = useTranslation();

  // 与 RankingTrendCharts 一致：图表所在页面不一定经过 dashboard 的初始化路径。
  useEffect(() => {
    initVChartSemiTheme({ isWatchingThemeSwitch: true });
  }, []);

  const spec = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return null;
    const latencyKey = t('平均首 Token 延迟');
    const tooltip = {
      title: { value: (datum) => String(datum?.label ?? '') },
      content: [
        {
          key: latencyKey,
          value: (datum) => formatLatency(Number(datum?.ttft)),
        },
      ],
    };
    return {
      type: 'line',
      data: [{ id: 'perf-latency', values: points }],
      xField: 'label',
      yField: 'ttft',
      smooth: true,
      line: { style: { lineWidth: 2 } },
      point: { visible: true, style: { size: 4 } },
      legends: { visible: false },
      tooltip: { mark: tooltip, dimension: tooltip },
      axes: [
        {
          orient: 'bottom',
          type: 'band',
          label: { autoHide: true, autoLimit: true },
          tick: { visible: false },
        },
        {
          orient: 'left',
          type: 'linear',
          label: {
            formatMethod: (value) => `${Math.round(Number(value))} ms`,
          },
          grid: { visible: true, style: { lineDash: [3, 3] } },
        },
      ],
    };
  }, [points, t]);

  if (!spec) return null;

  return (
    <div>
      <Text type='tertiary' size='small'>
        {title}
      </Text>
      <div style={{ height: CHART_HEIGHT, width: '100%', marginTop: 4 }}>
        <VChart key={`latency-${points.length}`} spec={spec} />
      </div>
    </div>
  );
}
