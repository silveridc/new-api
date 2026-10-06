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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Modal,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  Eye,
  Play,
  Trash2,
  Upload,
  History,
} from 'lucide-react';

import {
  deleteTaskPluginVersion,
  setTaskPluginStatus,
  TaskPluginUsageError,
} from '../../services/taskPlugins';

const RUNTIME_STATUS_META = {
  registered: { color: 'blue', label: '已注册' },
  compile_failed: { color: 'red', label: '编译失败' },
  disabled: { color: 'grey', label: '已禁用' },
  disabled_fallback: { color: 'grey', label: '已禁用（回落内建）' },
  not_registered: { color: 'grey', label: '未注册' },
};

export function renderPluginSource(source, factoryMeta, t) {
  if (source === 'factory') {
    return (
      <Tag color='white' shape='circle'>
        {t('内建')}
      </Tag>
    );
  }
  if (source === 'override_over_factory') {
    return (
      <Tooltip
        content={t(
          '内建版本 v{{version}}；删除自定义版本即可回到内建',
          { version: factoryMeta?.version ?? '' },
        )}
      >
        <Tag color='purple' shape='circle'>
          {t('自定义（覆盖内建 v{{version}}）', {
            version: factoryMeta?.version ?? '',
          })}
        </Tag>
      </Tooltip>
    );
  }
  return (
    <Tag color='orange' shape='circle'>
      {t('第三方')}
    </Tag>
  );
}

const PluginsTable = ({
  plugins,
  loading,
  onDetails,
  onVersions,
  onDryRun,
  onUploadNewVersion,
  onChanged,
  t,
}) => {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [blocked, setBlocked] = useState(null); // { action, usage, plugin }
  const [busy, setBusy] = useState(false);

  const closeBlocked = useCallback(() => setBlocked(null), []);

  const handleStatus = useCallback(
    async (plugin, enabled, options) => {
      setBusy(true);
      try {
        await setTaskPluginStatus(plugin.meta.key, enabled, options);
        setStatusConfirm(null);
        setBlocked(null);
        await onChanged();
      } catch (error) {
        if (error instanceof TaskPluginUsageError) {
          setStatusConfirm(null);
          setBlocked({ action: 'disable', usage: error.usage, plugin });
        } else {
          Modal.error({
            title: t('操作失败'),
            content: error.message,
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t],
  );

  const handleDelete = useCallback(
    async (plugin, force) => {
      setBusy(true);
      try {
        await deleteTaskPluginVersion(plugin.meta.key, plugin.meta.version, force);
        setDeleteTarget(null);
        setBlocked(null);
        await onChanged();
      } catch (error) {
        if (error instanceof TaskPluginUsageError) {
          setBlocked({ action: 'delete', usage: error.usage, plugin });
        } else {
          Modal.error({ title: t('操作失败'), content: error.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t],
  );

  const columns = useMemo(() => {
    return [
      {
        title: t('插件'),
        dataIndex: 'meta',
        render: (meta) => (
          <div className='min-w-0'>
            <div className='font-medium'>{meta?.name}</div>
            <Typography.Text
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: 220 }}
              type='tertiary'
              size='small'
              copyable
            >
              {meta?.key}
            </Typography.Text>
            {meta?.description ? (
              <div>
                <Typography.Text type='tertiary' size='small' ellipsis={{ showTooltip: true }} style={{ maxWidth: 260 }}>
                  {typeof meta.description === 'string'
                    ? meta.description
                    : (meta.description?.['zh'] ?? meta.description?.en ?? '')}
                </Typography.Text>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: t('当前版本'),
        dataIndex: 'meta',
        render: (_, record) => (
          <Typography.Text mono small>
            {record.meta?.version}
          </Typography.Text>
        ),
      },
      {
        title: t('来源'),
        dataIndex: 'source',
        render: (source, record) =>
          renderPluginSource(source, record.factory_meta, t),
      },
      {
        title: t('模型数'),
        dataIndex: 'meta',
        render: (_, record) => record.meta?.models?.length ?? 0,
      },
      {
        title: t('绑定渠道'),
        dataIndex: 'channel_count',
        render: (value, record) => (
          <span>
            {value}
            {record.in_flight_count > 0 ? (
              <Typography.Text type='warning' size='small'>
                {' '}
                / {t('进行中 {{count}}', { count: record.in_flight_count })}
              </Typography.Text>
            ) : null}
          </span>
        ),
      },
      {
        title: t('启用'),
        dataIndex: 'enabled',
        render: (enabled, record) => (
          <Switch
            checked={enabled}
            loading={busy}
            aria-label={t('启用插件 {{key}}', { key: record.meta?.key })}
            onChange={(checked) => setStatusConfirm({ plugin: record, enabled: checked })}
          />
        ),
      },
      {
        title: t('运行状态'),
        dataIndex: 'runtime_status',
        render: (status, record) => {
          const meta = RUNTIME_STATUS_META[status] || RUNTIME_STATUS_META.not_registered;
          return (
            <Tooltip content={record.runtime_error || ''}>
              <Tag color={meta.color} shape='circle'>
                {t(meta.label)}
              </Tag>
            </Tooltip>
          );
        },
      },
      {
        title: t('操作'),
        dataIndex: 'operation',
        render: (_, record) => (
          <div className='flex flex-wrap gap-1'>
            <Button
              theme='borderless'
              type='tertiary'
              icon={<Eye size={14} />}
              onClick={() => onDetails(record)}
            >
              {t('详情')}
            </Button>
            <Button
              theme='borderless'
              type='tertiary'
              icon={<History size={14} />}
              onClick={() => onVersions(record)}
            >
              {t('版本')}
            </Button>
            <Button
              theme='borderless'
              type='tertiary'
              icon={<Play size={14} />}
              onClick={() => onDryRun(record)}
            >
              {t('试运行')}
            </Button>
            <Button
              theme='borderless'
              type='tertiary'
              icon={<Upload size={14} />}
              onClick={() => onUploadNewVersion(record.meta.key)}
            >
              {t('上传新版本')}
            </Button>
            <Button
              theme='borderless'
              type='danger'
              icon={<Trash2 size={14} />}
              disabled={record.source === 'factory'}
              onClick={() => setDeleteTarget(record)}
            >
              {t('删除')}
            </Button>
          </div>
        ),
      },
    ];
  }, [busy, onDetails, onDryRun, onUploadNewVersion, onVersions, t]);

  return (
    <>
      <Table
        columns={columns}
        dataSource={plugins}
        rowKey={(record) => record.meta?.key}
        loading={loading}
        pagination={false}
        size='middle'
        empty={t('暂无任务插件，可上传或从市场安装')}
      />

      {/* 启用/禁用确认 */}
      <Modal
        title={statusConfirm?.enabled ? t('启用插件？') : t('禁用插件？')}
        visible={!!statusConfirm}
        onCancel={() => setStatusConfirm(null)}
        footer={[
          <Button key='cancel' onClick={() => setStatusConfirm(null)}>
            {t('取消')}
          </Button>,
          <Button
            key='ok'
            theme='solid'
            type={statusConfirm?.enabled ? 'primary' : 'danger'}
            loading={busy}
            onClick={() =>
              statusConfirm &&
              handleStatus(statusConfirm.plugin, statusConfirm.enabled)
            }
          >
            {statusConfirm?.enabled ? t('启用') : t('禁用')}
          </Button>,
        ]}
      >
        <p>
          {statusConfirm?.enabled
            ? t('确认启用插件 {{name}}（{{key}}）？', {
                name: statusConfirm?.plugin.meta.name,
                key: statusConfirm?.plugin.meta.key,
              })
            : t('禁用插件 {{name}}（{{key}}）？使用该插件的任务请求可能受影响。', {
                name: statusConfirm?.plugin.meta.name,
                key: statusConfirm?.plugin.meta.key,
              })}
        </p>
      </Modal>

      {/* 删除确认 */}
      <Modal
        title={t('删除插件版本？')}
        visible={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        footer={[
          <Button key='cancel' onClick={() => setDeleteTarget(null)}>
            {t('取消')}
          </Button>,
          <Button
            key='ok'
            theme='solid'
            type='danger'
            loading={busy}
            onClick={() => deleteTarget && handleDelete(deleteTarget, false)}
          >
            {t('删除')}
          </Button>,
        ]}
      >
        <p>
          {t('将删除 {{name}}（{{key}}）的 v{{version}}。', {
            name: deleteTarget?.meta.name,
            key: deleteTarget?.meta.key,
            version: deleteTarget?.meta.version,
          })}
        </p>
        <Banner
          type={deleteTarget?.factory_meta ? 'info' : 'warning'}
          closeIcon={null}
          description={
            deleteTarget?.factory_meta
              ? t('删除自定义版本不会禁用平台，同名内建插件将自动恢复。')
              : t('该插件没有内建回退，删除或禁用后平台将不可用。')
          }
        />
      </Modal>

      {/* 仍被占用：级联禁用 / 强制 */}
      <Modal
        title={t('插件仍被使用')}
        visible={!!blocked}
        onCancel={closeBlocked}
        footer={[
          <Button key='cancel' onClick={closeBlocked}>
            {t('取消')}
          </Button>,
          blocked?.action === 'delete' ? (
            <Button
              key='force'
              theme='solid'
              type='danger'
              loading={busy}
              onClick={() => blocked?.plugin && handleDelete(blocked.plugin, true)}
            >
              {t('强制删除')}
            </Button>
          ) : (
            <Button
              key='force'
              theme='solid'
              type='danger'
              loading={busy}
              onClick={() =>
                blocked?.plugin &&
                handleStatus(blocked.plugin, false, { cascade: true, force: true })
              }
            >
              {t('级联禁用渠道并强制禁用')}
            </Button>
          ),
        ]}
      >
        <p>
          {t('{{count}} 个启用渠道和 {{tasks}} 个进行中任务仍在使用该插件。', {
            count: blocked?.usage?.channels?.length ?? 0,
            tasks: blocked?.usage?.in_flight_count ?? 0,
          })}
        </p>
        <ul className='list-disc pl-5'>
          {(blocked?.usage?.channels ?? []).map((channel) => (
            <li key={channel.id}>
              #{channel.id} {channel.name}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
};

export default PluginsTable;
