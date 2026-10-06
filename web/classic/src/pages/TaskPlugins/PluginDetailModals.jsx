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

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Descriptions,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { Play, Trash2 } from 'lucide-react';

import {
  activateTaskPlugin,
  deleteTaskPluginVersion,
  dryRunTaskPlugin,
  getTaskPlugin,
  getTaskPluginVersions,
} from '../../services/taskPlugins';

/** 插件详情：meta 概要 + 源码查看（GET /api/plugin/task/:key[?version=]） */
export const PluginDetailModal = ({ plugin, visible, onClose }) => {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !plugin?.meta?.key) return;
    setLoading(true);
    setError('');
    getTaskPlugin(plugin.meta.key)
      .then((data) => setDetail(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [visible, plugin?.meta?.key]);

  const meta = detail?.meta || plugin?.meta || {};

  return (
    <Modal
      title={t('插件详情：{{name}}', { name: meta.name })}
      visible={visible}
      onCancel={onClose}
      width={760}
      footer={<Button onClick={onClose}>{t('关闭')}</Button>}
    >
      <Spin spinning={loading}>
        <Descriptions
          row
          size='small'
          className='!mb-3'
          data={[
            { key: t('标识'), value: meta.key || '-' },
            { key: t('版本'), value: meta.version || '-' },
            { key: t('API 版本'), value: String(meta.apiVersion ?? '-') },
            {
              key: t('作者'),
              value: meta.author?.name || '-',
            },
            {
              key: t('抓取模式'),
              value: meta.fetchMode || '-',
            },
            {
              key: t('模型'),
              value: (meta.models ?? []).join(', ') || '-',
            },
            {
              key: t('绑定渠道类型'),
              value: (meta.channelTypes ?? []).map((type) => `#${type}`).join(' ') || t('任务插件'),
            },
          ]}
        />
        {meta.website ? (
          <p className='!mb-2'>
            <a href={meta.website} target='_blank' rel='noopener noreferrer'>
              {meta.website}
            </a>
          </p>
        ) : null}
        {error ? <Banner type='danger' closeIcon={null} description={error} /> : null}
        <Typography.Text strong size='small'>
          {t('插件源码')}
        </Typography.Text>
        <pre className='mt-1 max-h-80 overflow-auto rounded-md border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-2 font-mono text-xs'>
          {detail?.source || ''}
        </pre>
      </Spin>
    </Modal>
  );
};

/** 版本管理：GET versions + POST activate + DELETE versions/:version */
export const PluginVersionsModal = ({
  plugin,
  visible,
  onClose,
  onChanged,
}) => {
  const { t } = useTranslation();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = plugin?.meta?.key;

  const load = async () => {
    if (!key) return;
    setLoading(true);
    try {
      setVersions(await getTaskPluginVersions(key));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key]);

  const handleActivate = async (version) => {
    setBusy(true);
    try {
      await activateTaskPlugin(key, version);
      await load();
      await onChanged?.();
    } catch (activateError) {
      setError(activateError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (version) => {
    setBusy(true);
    try {
      await deleteTaskPluginVersion(key, version);
      await load();
      await onChanged?.();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      title: t('版本'),
      dataIndex: 'version',
      render: (version, record) => (
        <SpaceInline>
          <Typography.Text mono>{version}</Typography.Text>
          {record.active ? (
            <Tag color='green' size='small'>
              {t('当前')}
            </Tag>
          ) : null}
          {!record.enabled ? (
            <Tag color='grey' size='small'>
              {t('保存时禁用')}
            </Tag>
          ) : null}
        </SpaceInline>
      ),
    },
    {
      title: t('备注'),
      dataIndex: 'remark',
      render: (remark) => remark || '-',
    },
    {
      title: t('保存时间'),
      dataIndex: 'created_at',
      render: (value) =>
        value ? new Date(value * 1000).toLocaleString() : '-',
    },
    {
      title: t('操作'),
      dataIndex: 'operation',
      render: (_, record) => (
        <div className='flex gap-1'>
          <Button
            size='small'
            theme='borderless'
            disabled={record.active || busy}
            onClick={() => handleActivate(record.version)}
          >
            {t('激活')}
          </Button>
          <Popconfirm
            title={t('确认删除版本 v{{version}}？', { version: record.version })}
            onConfirm={() => handleDelete(record.version)}
          >
            <Button
              size='small'
              theme='borderless'
              type='danger'
              icon={<Trash2 size={12} />}
              disabled={busy}
            >
              {t('删除')}
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={t('版本管理：{{name}}', { name: plugin?.meta?.name })}
      visible={visible}
      onCancel={onClose}
      width={680}
      footer={<Button onClick={onClose}>{t('关闭')}</Button>}
    >
      {error ? <Banner type='danger' closeIcon={null} description={error} /> : null}
      <Table
        columns={columns}
        dataSource={versions}
        rowKey={(record) => `${record.key}-${record.version}`}
        loading={loading}
        pagination={false}
        size='small'
        empty={t('暂无历史版本')}
      />
    </Modal>
  );
};

function SpaceInline({ children }) {
  return <span className='inline-flex items-center gap-1'>{children}</span>;
}

/** 试运行：POST /api/plugin/task/:key/dryrun { hook, member?, args } */
export const DryRunModal = ({ plugin, visible, onClose }) => {
  const { t } = useTranslation();
  const [hook, setHook] = useState('');
  const [member, setMember] = useState('');
  const [argsText, setArgsText] = useState('[]');
  const [output, setOutput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setHook('');
      setMember('');
      setArgsText('[]');
      setOutput('');
      setError('');
    }
  }, [visible, plugin?.meta?.key]);

  const handleRun = async () => {
    let args;
    try {
      args = JSON.parse(argsText || '[]');
      if (!Array.isArray(args)) throw new Error('args must be an array');
    } catch (parseError) {
      setError(t('参数必须是 JSON 数组：{{message}}', { message: parseError.message }));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await dryRunTaskPlugin(plugin.meta.key, {
        hook,
        member,
        args,
      });
      setOutput(JSON.stringify(result, null, 2));
    } catch (runError) {
      setError(runError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('试运行：{{name}}', { name: plugin?.meta?.name })}
      visible={visible}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key='close' onClick={onClose}>
          {t('关闭')}
        </Button>,
        <Button
          key='run'
          theme='solid'
          type='primary'
          icon={<Play size={14} />}
          loading={submitting}
          disabled={!hook.trim()}
          onClick={handleRun}
        >
          {t('运行')}
        </Button>,
      ]}
    >
      <div className='flex flex-col gap-3'>
        <Input
          placeholder={t('钩子名称，如 fetch / query')}
          value={hook}
          onChange={setHook}
        />
        <Input
          placeholder={t('member（可选，钩子成员名）')}
          value={member}
          onChange={setMember}
        />
        <textarea
          aria-label={t('参数 JSON 数组')}
          value={argsText}
          onChange={(event) => setArgsText(event.target.value)}
          rows={4}
          spellCheck={false}
          className='w-full rounded-md border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-2 font-mono text-xs'
          placeholder='["arg1", 2, {"key": "value"}]'
        />
        {error ? <Banner type='danger' closeIcon={null} description={error} /> : null}
        {output ? (
          <div>
            <Typography.Text strong size='small'>
              {t('输出')}
            </Typography.Text>
            <pre className='mt-1 max-h-72 overflow-auto rounded-md border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-2 font-mono text-xs'>
              {output}
            </pre>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};
