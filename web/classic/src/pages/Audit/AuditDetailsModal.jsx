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
*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Descriptions, Modal, Tag, Typography } from '@douyinfe/semi-ui';

import {
  buildAuditDetails,
  describeAuditTaskPlugin,
} from '../../services/auditLogs';
import { timestamp2string } from '../../helpers';

function formatValue(value) {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * 审计日志详情弹窗。展示字段：操作者、角色、认证方式、动作参数、
 * 请求信息（method/route/status/ip/UA/令牌标识/请求 ID）、
 * 以及 other 中剩余元数据（含 admin_info 扩展字段：request_policy、
 * quota_saturation、task_plugin 插件平台信息等，字段要全）。
 */
const AuditDetailsModal = ({ entry, visible, onClose }) => {
  const { t } = useTranslation();
  if (!entry) return null;
  const detail = buildAuditDetails(entry);
  const taskPlugin = describeAuditTaskPlugin(entry);

  const operationRows = [
    { key: t('操作者'), value: detail.actor || '-' },
    { key: t('角色'), value: detail.actorRole || formatValue(entry.actor_role) },
    { key: t('动作'), value: detail.action || '-' },
    {
      key: t('认证方式'),
      value: detail.authentication || formatValue(entry.auth_method),
    },
    { key: t('目标用户'), value: formatValue(entry.username) },
    {
      key: t('令牌标识'),
      value: formatValue(entry.token_ref),
    },
  ];

  const requestRows = [
    { key: t('方法'), value: entry.method || '-' },
    { key: 'HTTP', value: entry.status || '-' },
    { key: t('路由'), value: entry.route || '-' },
    { key: 'IP', value: entry.ip || '-' },
    { key: t('客户端'), value: entry.user_agent || '-' },
    { key: t('请求 ID'), value: entry.request_id || '-' },
    { key: t('事件 ID'), value: entry.event_id || '-' },
    {
      key: t('时间'),
      value: entry.created_at ? timestamp2string(entry.created_at) : '-',
    },
  ];

  return (
    <Modal
      title={t('审计详情')}
      visible={visible}
      onCancel={onClose}
      width={720}
      footer={<Button onClick={onClose}>{t('关闭')}</Button>}
    >
      <div className='mb-2 flex items-center gap-2'>
        {entry.success ? (
          <Tag color='green' size='small'>
            {t('成功')}
          </Tag>
        ) : (
          <Tag color='red' size='small'>
            {t('失败')}
          </Tag>
        )}
        <Tag size='small'>{entry.category || '-'}</Tag>
      </div>
      <Typography.Paragraph>{detail.summary || '-'}</Typography.Paragraph>

      <Typography.Text strong size='small'>
        {t('操作审计信息')}
      </Typography.Text>
      <Descriptions
        size='small'
        className='!my-2'
        data={operationRows.map((row) => ({ key: row.key, value: formatValue(row.value) }))}
      />

      {detail.paramsFields.length ? (
        <>
          <Typography.Text strong size='small'>
            {t('动作参数')}
          </Typography.Text>
          <Descriptions
            size='small'
            className='!my-2'
            data={detail.paramsFields.map((field) => ({
              key: field.label,
              value: formatValue(field.value),
            }))}
          />
        </>
      ) : null}

      <Typography.Text strong size='small'>
        {t('请求信息')}
      </Typography.Text>
      <Descriptions
        size='small'
        className='!my-2'
        data={requestRows.map((row) => ({ key: row.key, value: formatValue(row.value) }))}
      />

      {taskPlugin ? (
        <>
          <Typography.Text strong size='small'>
            {t('插件平台')}
          </Typography.Text>
          <Descriptions
            size='small'
            className='!my-2'
            data={[
              { key: t('名称'), value: taskPlugin.name || '-' },
              { key: t('标识'), value: taskPlugin.key || '-' },
              { key: t('版本'), value: taskPlugin.version || '-' },
            ]}
          />
        </>
      ) : null}

      {detail.metadataUnavailable ? (
        <Typography.Text type='tertiary' size='small'>
          {t('审计元数据不可用')}
        </Typography.Text>
      ) : null}

      {Object.keys(detail.extra).length ? (
        <>
          <Typography.Text strong size='small'>
            {t('附加信息')}
          </Typography.Text>
          <Descriptions
            size='small'
            className='!my-2'
            data={Object.entries(detail.extra).map(([key, value]) => ({
              key,
              value: formatValue(value),
            }))}
          />
        </>
      ) : null}

      {entry.content && entry.content !== detail.summary ? (
        <>
          <Typography.Text strong size='small'>
            {t('原始内容')}
          </Typography.Text>
          <pre className='mt-1 max-h-48 overflow-auto rounded-md border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-2 font-mono text-xs'>
            {entry.content}
          </pre>
        </>
      ) : null}
    </Modal>
  );
};

export default AuditDetailsModal;
