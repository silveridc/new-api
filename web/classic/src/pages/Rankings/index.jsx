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
  Empty,
  Row,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { showError } from '../../helpers';
import {
  RANKING_PERIODS,
  DEFAULT_RANKING_PERIOD,
  getRankings,
  buildModelRows,
  buildVendorRows,
  buildMoverRows,
} from '../../services/rankings';

const { Text, Title } = Typography;

function growthTag(label, value) {
  if (label === '-') return <Text type='tertiary'>-</Text>;
  const color = value > 0 ? 'green' : value < 0 ? 'red' : 'grey';
  return <Tag color={color}>{label}</Tag>;
}

export default function Rankings() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(DEFAULT_RANKING_PERIOD);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState(null);

  const loadRankings = useCallback(async (nextPeriod) => {
    setLoading(true);
    try {
      const data = await getRankings(nextPeriod);
      setSnapshot(data);
    } catch (error) {
      setSnapshot(null);
      showError(error.message || t('获取排行榜数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRankings(period);
  }, [period, loadRankings]);

  const modelRows = buildModelRows(snapshot?.models);
  const vendorRows = buildVendorRows(snapshot?.vendors);
  const moverRows = buildMoverRows(snapshot?.top_movers);
  const dropperRows = buildMoverRows(snapshot?.top_droppers);

  const modelColumns = [
    {
      title: t('排名'),
      dataIndex: 'display_rank',
      width: 90,
      render: (text, record) =>
        record.is_new ? (
          <Tag color='blue'>{t('新上榜')}</Tag>
        ) : (
          <Text strong>{text}</Text>
        ),
    },
    {
      title: t('模型'),
      dataIndex: 'model_name',
      render: (text) => <Text strong>{text}</Text>,
    },
    { title: t('厂商'), dataIndex: 'vendor' },
    { title: t('分类'), dataIndex: 'category' },
    {
      title: t('Tokens'),
      dataIndex: 'total_tokens_label',
      render: (text) => <Text>{text}</Text>,
    },
    { title: t('份额'), dataIndex: 'share_label' },
    {
      title: t('环比'),
      dataIndex: 'growth_label',
      render: (text, record) => growthTag(text, record.growth_pct),
    },
  ];

  const vendorColumns = [
    {
      title: t('排名'),
      dataIndex: 'display_rank',
      width: 90,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: t('厂商'),
      dataIndex: 'vendor',
      render: (text) => <Text strong>{text}</Text>,
    },
    { title: t('模型数'), dataIndex: 'models_count' },
    { title: t('最热门模型'), dataIndex: 'top_model' },
    { title: t('Tokens'), dataIndex: 'total_tokens_label' },
    { title: t('份额'), dataIndex: 'share_label' },
    {
      title: t('环比'),
      dataIndex: 'growth_label',
      render: (text, record) => growthTag(text, record.growth_pct),
    },
  ];

  const moverColumns = [
    {
      title: t('当前排名'),
      dataIndex: 'current_rank',
      width: 100,
      render: (text) => <Text strong>#{text}</Text>,
    },
    {
      title: t('模型'),
      dataIndex: 'model_name',
      render: (text) => <Text strong>{text}</Text>,
    },
    { title: t('厂商'), dataIndex: 'vendor' },
    { title: t('Tokens 环比'), dataIndex: 'growth_label' },
  ];

  const periodSelector = (
    <Select
      value={period}
      onChange={(value) => setPeriod(value)}
      optionList={RANKING_PERIODS.map((p) => ({ ...p, label: t(p.label) }))}
      style={{ width: 140 }}
      aria-label={t('时间范围')}
    />
  );

  return (
    <div className='mt-[60px] px-2 pb-6'>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={16}>
          <Title heading={4}>{t('模型排行榜')}</Title>
          <Text type='tertiary' size='small'>
            {t(
              '基于时间窗口内的 Tokens 用量统计（服务端缓存约 5 分钟刷新）。',
            )}
          </Text>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {periodSelector}
            <Button
              icon={<IconRefresh />}
              loading={loading}
              onClick={() => loadRankings(period)}
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
          '数据为全站聚合统计；份额为该模型/厂商 Tokens 占总 Tokens 的比例。',
        )}
      />

      <Spin spinning={loading}>
        <Card bodyStyle={{ paddingTop: 4 }}>
          <Tabs type='line'>
            <Tabs.TabPane tab={t('模型调用排行')} itemKey='models'>
              <Table
                columns={modelColumns}
                dataSource={modelRows}
                rowKey='key'
                loading={loading}
                pagination={modelRows.length > 10 ? { pageSize: 10 } : false}
                size='small'
                empty={
                  <Empty description={t('当前时间范围内暂无数据')} />
                }
              />
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('厂商市场份额')} itemKey='vendors'>
              <Table
                columns={vendorColumns}
                dataSource={vendorRows}
                rowKey='key'
                loading={loading}
                pagination={false}
                size='small'
                empty={<Empty description={t('当前时间范围内暂无数据')} />}
              />
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('升降榜')} itemKey='pulse'>
              <Row gutter={[12, 12]}>
                <Col xs={24} lg={12}>
                  <Title heading={6} style={{ marginBottom: 8 }}>
                    {t('上升最快')}
                  </Title>
                  <Table
                    columns={moverColumns}
                    dataSource={moverRows}
                    rowKey='key'
                    loading={loading}
                    pagination={false}
                    size='small'
                    empty={<Empty description={t('暂无数据')} />}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <Title heading={6} style={{ marginBottom: 8 }}>
                    {t('下降最快')}
                  </Title>
                  <Table
                    columns={moverColumns}
                    dataSource={dropperRows}
                    rowKey='key'
                    loading={loading}
                    pagination={false}
                    size='small'
                    empty={<Empty description={t('暂无数据')} />}
                  />
                </Col>
              </Row>
            </Tabs.TabPane>
          </Tabs>
        </Card>
      </Spin>
    </div>
  );
}
