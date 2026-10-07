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

import React, { useMemo } from 'react';
import { Table, Tag, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { collectModelUsageSchemas } from '../../../../../services/usageSchema';

const { Text, Title } = Typography;

/**
 * 模型计费用量字段（usage schema）展示。
 * 数据来自 /api/pricing 的 billing_usage_schema / billing_plugin_variants，
 * 仅做展示（对齐新版 @/features/pricing 的 billing_usage_schema 用法）。
 */
export default function ModelUsageSchema({ modelData }) {
  const { t, i18n } = useTranslation();

  const sections = useMemo(
    () => collectModelUsageSchemas(modelData, i18n.language),
    [modelData, i18n.language],
  );

  if (sections.length === 0) return null;

  const columns = [
    {
      title: t('字段'),
      dataIndex: 'field',
      width: 160,
      render: (text) => (
        <Text code size='small'>
          {text}
        </Text>
      ),
    },
    {
      title: t('类型'),
      dataIndex: 'type',
      width: 90,
    },
    {
      title: t('单位'),
      dataIndex: 'unit',
      width: 100,
    },
    {
      title: t('说明'),
      dataIndex: 'description',
      render: (text, record) => (
        <div>
          <Text size='small'>{text === '-' ? t('暂无说明') : text}</Text>
          {record.enum_values.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {record.enum_values.map((item) => (
                <Tag key={item.value} size='small' style={{ marginRight: 4 }}>
                  {item.label}
                </Tag>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title heading={6} style={{ marginBottom: 8 }}>
        {t('计费用量字段')}
      </Title>
      {sections.map((section) => (
        <div key={section.key} style={{ marginBottom: 12 }}>
          {section.key !== 'main' && (
            <Text strong size='small'>
              {section.title}
            </Text>
          )}
          <Table
            columns={columns}
            dataSource={section.rows}
            rowKey='key'
            pagination={false}
            size='small'
            empty={null}
          />
          {section.examples.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {section.examples.slice(0, 3).map((example, index) => (
                <Text
                  key={`${section.key}-example-${index}`}
                  type='tertiary'
                  size='small'
                  style={{ display: 'block' }}
                >
                  {example.label}
                  {Object.keys(example.facts || {}).length > 0
                    ? `: ${JSON.stringify(example.facts)}`
                    : ''}
                </Text>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
