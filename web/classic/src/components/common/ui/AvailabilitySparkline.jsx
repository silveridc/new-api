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
import { Tooltip, Typography } from '@douyinfe/semi-ui';

import { formatDateTimeString } from '../../../helpers';
import {
  availabilityBarHeight,
  formatSuccessRate,
  successRateColor,
} from '../../../services/performance';

const { Text } = Typography;

/**
 * 成功率迷你柱图：一小时一根柱子，颜色按成功率分级，成功率越低柱子越矮。
 * 视觉规则对齐新版 web/src/features/pricing/components/model-perf-badge.tsx，
 * 但这里把后端返回的小时序列直接画出来，并给每根柱子补了可读的时间提示。
 */
const SIZES = {
  sm: { height: 14, barWidth: 3, gap: 1 },
  md: { height: 20, barWidth: 4, gap: 2 },
};

const AvailabilitySparkline = ({
  points,
  size = 'md',
  overall,
  showOverall = true,
  emptyLabel = '-',
  label,
  className,
  style,
}) => {
  const { height, barWidth, gap } = SIZES[size] || SIZES.md;
  const samples = Array.isArray(points) ? points : [];

  if (samples.length === 0) {
    return (
      <Text type='tertiary' size='small'>
        {emptyLabel}
      </Text>
    );
  }

  const overallRate =
    Number.isFinite(Number(overall)) && samples.length > 0
      ? Number(overall)
      : samples.reduce((sum, point) => sum + point.rate, 0) / samples.length;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...style,
      }}
    >
      <div
        role='img'
        aria-label={label || formatSuccessRate(overallRate)}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap,
          height,
        }}
      >
        {samples.map((point) => (
          <Tooltip
            key={point.ts}
            content={
              <div style={{ lineHeight: '18px' }}>
                <div>{formatDateTimeString(new Date(point.ts * 1000))}</div>
                <div>{formatSuccessRate(point.rate)}</div>
              </div>
            }
          >
            <div
              aria-hidden
              style={{
                width: barWidth,
                height: `${availabilityBarHeight(point.rate)}%`,
                minHeight: 2,
                borderRadius: 2,
                backgroundColor: successRateColor(point.rate),
              }}
            />
          </Tooltip>
        ))}
      </div>
      {showOverall && (
        <Text
          size='small'
          strong
          style={{
            color: successRateColor(overallRate),
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatSuccessRate(overallRate)}
        </Text>
      )}
    </div>
  );
};

export default AvailabilitySparkline;
