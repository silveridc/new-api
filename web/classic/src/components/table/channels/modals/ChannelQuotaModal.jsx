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
import { Button, Modal, Spin, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { API, showError } from '../../../../helpers';

const { Text } = Typography;

const formatAmount = (value) => {
  const amount = Number(value) || 0;
  return `$${amount.toFixed(amount >= 100 ? 2 : 4)}`;
};

const QuotaDimensionCell = ({ t, dimension }) => {
  if (!dimension || !(dimension.limit > 0)) {
    return <Text type='tertiary'>{t('不限')}</Text>;
  }
  const exhausted = dimension.remaining === 0;
  return (
    <div className='leading-5'>
      <div className={exhausted ? 'font-medium text-red-500' : 'font-medium'}>
        {t('剩余')} {formatAmount(dimension.remaining)}
        {exhausted ? (
          <Tag color='red' size='small' className='ml-2'>
            {t('已用尽')}
          </Tag>
        ) : null}
      </div>
      <Text type='tertiary' size='small'>
        {t('已用')} {formatAmount(dimension.used)} / {t('限额')}{' '}
        {formatAmount(dimension.limit)}
      </Text>
    </div>
  );
};

const QuotaView = ({ t, record, payload, failed, onRefresh }) => {
  const scopes = Array.isArray(payload?.scopes) ? payload.scopes : [];
  const configured = scopes.some(
    (scope) =>
      scope?.enabled === true ||
      ['daily', 'weekly', 'total'].some(
        (key) => Number(scope?.[key]?.limit) > 0,
      ),
  );
  const columns = [
    {
      title: t('范围'),
      dataIndex: 'model',
      width: 150,
      render: (text, row) => (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='break-all'>{text}</span>
          {row.enabled ? null : (
            <Tag color='grey' size='small'>
              {t('未启用')}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: t('日额度'),
      dataIndex: 'daily',
      render: (dimension) => <QuotaDimensionCell t={t} dimension={dimension} />,
    },
    {
      title: t('周额度'),
      dataIndex: 'weekly',
      render: (dimension) => <QuotaDimensionCell t={t} dimension={dimension} />,
    },
    {
      title: t('总额度'),
      dataIndex: 'total',
      render: (dimension) => <QuotaDimensionCell t={t} dimension={dimension} />,
    },
  ];

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <Text type='tertiary' size='small'>
          {t('渠道：')}
          {record?.name || '-'} ({t('编号：')}
          {record?.id || '-'})
        </Text>
        <Button
          size='small'
          type='tertiary'
          theme='outline'
          onClick={onRefresh}
        >
          {t('刷新')}
        </Button>
      </div>
      {failed ? (
        <Text type='danger' size='small'>
          {t('获取剩余额度失败')}
        </Text>
      ) : null}
      {failed || configured ? null : (
        <Text type='tertiary' size='small'>
          {t('该渠道未配置额度限制，不会按额度拦截请求。')}
        </Text>
      )}
      {failed ? null : (
        <Table
          size='small'
          columns={columns}
          dataSource={scopes.map((scope) => ({
            key: scope.model || '__channel__',
            model: scope.model || t('渠道整体'),
            enabled: scope.enabled === true,
            daily: scope.daily,
            weekly: scope.weekly,
            total: scope.total,
          }))}
          pagination={false}
        />
      )}
      <Text type='tertiary' size='small'>
        {t('已用按用户实际扣费累加；已过期的滚动窗口按 0 计算。')}
      </Text>
    </div>
  );
};

const QuotaLoader = ({ t, record }) => {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);

  const fetchQuota = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/channel/${record.id}/quota`, {
        skipErrorHandler: true,
      });
      if (res?.data?.success) {
        setPayload(res.data.data ?? null);
        setFailed(false);
      } else {
        setFailed(true);
        showError(res?.data?.message || t('获取剩余额度失败'));
      }
    } catch (error) {
      setFailed(true);
      showError(error?.message || t('获取剩余额度失败'));
    } finally {
      setLoading(false);
    }
  }, [record.id, t]);

  useEffect(() => {
    fetchQuota().catch(() => {});
  }, [fetchQuota]);

  if (loading) {
    return (
      <div className='flex items-center justify-center py-10'>
        <Spin spinning={true} size='large' tip={t('加载中...')} />
      </div>
    );
  }

  return (
    <QuotaView
      t={t}
      record={record}
      payload={payload}
      failed={failed}
      onRefresh={fetchQuota}
    />
  );
};

export const openChannelQuotaModal = ({ t, record }) => {
  // 只销毁本弹窗：从渠道编辑框里打开时，Modal.destroyAll() 会连编辑框一起关掉。
  const dialog = Modal.info({
    title: t('剩余额度'),
    centered: false,
    width: 720,
    style: { top: 64, maxWidth: 'min(720px, 92vw)' },
    bodyStyle: {
      maxHeight: 'calc(100vh - 200px)',
      overflowY: 'auto',
      padding: '16px 24px',
    },
    content: <QuotaLoader t={t} record={record} />,
    footer: (
      <div className='flex justify-end gap-2'>
        <Button type='primary' theme='solid' onClick={() => dialog?.destroy()}>
          {t('关闭')}
        </Button>
      </div>
    ),
  });
};
