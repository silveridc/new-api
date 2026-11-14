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
import {
  Banner,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { IconCopy, IconDelete, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { API, copy, showError, showSuccess } from '../../helpers';

const EMPTY_FORM = {
  name: '',
  redirectURIs: '',
  scopes: ['openid', 'profile', 'email'],
  public: false,
  enabled: true,
};

const OIDCProviderClients = ({ t, serverAddress }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const issuer = serverAddress || window.location.origin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/oidc/clients/');
      if (res.data?.success) {
        setClients(res.data.data || []);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (error) {
      showError(error.response?.data?.message || t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (client) => {
    setEditing(client);
    setForm({
      name: client.name,
      redirectURIs: (client.redirect_uris || []).join('\n'),
      scopes: (client.scopes || 'openid profile email').split(' '),
      public: client.public,
      enabled: client.enabled,
    });
    setModalVisible(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      showError(t('请输入名称'));
      return;
    }
    const redirectURIs = form.redirectURIs
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (redirectURIs.length === 0) {
      showError(t('请至少填写一个回调地址'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        redirect_uris: redirectURIs,
        scopes: form.scopes.join(' '),
        public: form.public,
        enabled: form.enabled,
      };
      const res = editing
        ? await API.put(`/api/oidc/clients/${editing.id}`, payload)
        : await API.post('/api/oidc/clients/', payload);
      if (!res.data?.success) {
        showError(res.data?.message || t('保存失败'));
        return;
      }
      setModalVisible(false);
      showSuccess(t('保存成功'));
      if (!editing && res.data.data?.client_secret) {
        setNewSecret(res.data.data.client_secret);
      }
      await load();
    } catch (error) {
      showError(error.response?.data?.message || t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (client, enabled) => {
    try {
      const res = await API.put(`/api/oidc/clients/${client.id}`, {
        name: client.name,
        redirect_uris: client.redirect_uris,
        scopes: client.scopes,
        public: client.public,
        enabled,
      });
      if (!res.data?.success) {
        showError(res.data?.message || t('保存失败'));
        return;
      }
      await load();
    } catch (error) {
      showError(error.response?.data?.message || t('保存失败'));
    }
  };

  const remove = (client) => {
    Modal.confirm({
      title: t('删除 OIDC 客户端'),
      content: t('删除后该应用将无法再通过本实例登录，确定继续吗？'),
      onOk: async () => {
        try {
          const res = await API.delete(`/api/oidc/clients/${client.id}`);
          if (!res.data?.success) {
            showError(res.data?.message || t('删除失败'));
            return;
          }
          showSuccess(t('删除成功'));
          await load();
        } catch (error) {
          showError(error.response?.data?.message || t('删除失败'));
        }
      },
    });
  };

  const resetSecret = (client) => {
    Modal.confirm({
      title: t('重置客户端密钥'),
      content: t('旧密钥将立即失效，确定继续吗？'),
      onOk: async () => {
        try {
          const res = await API.post(`/api/oidc/clients/${client.id}/secret`);
          if (!res.data?.success) {
            showError(res.data?.message || t('重置失败'));
            return;
          }
          setNewSecret(res.data.data?.client_secret || '');
        } catch (error) {
          showError(error.response?.data?.message || t('重置失败'));
        }
      },
    });
  };

  const columns = [
    {
      title: t('名称'),
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: 'Client ID',
      dataIndex: 'client_id',
      width: 260,
      render: (value) => (
        <Typography.Text
          copyable={{ content: value }}
          className='font-mono text-xs'
        >
          {value}
        </Typography.Text>
      ),
    },
    {
      title: t('回调地址'),
      dataIndex: 'redirect_uris',
      ellipsis: true,
      render: (value) => (
        <Typography.Text ellipsis={{ showTooltip: true }} className='text-xs'>
          {(value || []).join(', ')}
        </Typography.Text>
      ),
    },
    {
      title: t('类型'),
      dataIndex: 'public',
      width: 100,
      render: (value) => (
        <Tag size='small' color={value ? 'blue' : 'green'}>
          {value ? t('公共客户端') : t('机密客户端')}
        </Tag>
      ),
    },
    {
      title: t('启用'),
      dataIndex: 'enabled',
      width: 80,
      render: (value, record) => (
        <Switch
          size='small'
          checked={Boolean(value)}
          onChange={(checked) => toggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: t('操作'),
      width: 220,
      render: (_, record) => (
        <div className='flex items-center gap-1'>
          <Button size='small' theme='borderless' onClick={() => openEdit(record)}>
            {t('编辑')}
          </Button>
          {!record.public && (
            <Button
              size='small'
              theme='borderless'
              icon={<IconRefresh />}
              onClick={() => resetSecret(record)}
            >
              {t('重置密钥')}
            </Button>
          )}
          <Button
            size='small'
            theme='borderless'
            type='danger'
            icon={<IconDelete />}
            onClick={() => remove(record)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <Banner
        type='info'
        closeIcon={null}
        description={`${t('将本实例作为 OIDC 登录提供方，外部应用使用以下地址接入：')} ${issuer}/.well-known/openid-configuration`}
      />
      <div className='flex justify-end'>
        <Button
          type='primary'
          theme='solid'
          icon={<IconPlus />}
          onClick={openCreate}
        >
          {t('新增客户端')}
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={clients}
        rowKey='id'
        loading={loading}
        size='small'
        pagination={false}
        empty={t('暂无 OIDC 客户端')}
      />

      <Modal
        title={editing ? t('编辑 OIDC 客户端') : t('新增 OIDC 客户端')}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={submit}
        confirmLoading={saving}
        width={600}
      >
        <div className='space-y-3'>
          <div>
            <div className='mb-1 text-sm'>{t('名称')}</div>
            <Input
              value={form.name}
              onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
              placeholder={t('例如：内部 Wiki')}
            />
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('回调地址')}</div>
            <TextArea
              value={form.redirectURIs}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, redirectURIs: value }))
              }
              rows={4}
              placeholder={'https://app.example.com/callback'}
            />
            <div className='mt-1 text-xs text-slate-500'>
              {t('每行一个，必须与应用配置完全一致')}
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('授权范围')}</div>
            <Select
              multiple
              value={form.scopes}
              optionList={['openid', 'profile', 'email'].map((scope) => ({
                value: scope,
                label: scope,
              }))}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, scopes: value }))
              }
              style={{ width: '100%' }}
            />
          </div>
          <Checkbox
            checked={form.public}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, public: e.target.checked }))
            }
          >
            {t('公共客户端（不使用密钥，必须启用 PKCE）')}
          </Checkbox>
        </div>
      </Modal>

      <Modal
        title={t('请保存客户端密钥')}
        visible={Boolean(newSecret)}
        footer={
          <Button type='primary' onClick={() => setNewSecret('')}>
            {t('我已保存')}
          </Button>
        }
        onCancel={() => setNewSecret('')}
      >
        <Banner
          type='warning'
          closeIcon={null}
          description={t('密钥只显示一次，关闭后无法再次查看。')}
        />
        <div className='flex items-center gap-2 mt-3'>
          <Input value={newSecret} readOnly className='font-mono' />
          <Button
            icon={<IconCopy />}
            onClick={async () => {
              await copy(newSecret);
              showSuccess(t('已复制'));
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default OIDCProviderClients;
