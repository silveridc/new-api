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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  Empty,
  Modal,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconCopy, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../../helpers';
import { useSecureVerification } from '../../../../hooks/common/useSecureVerification';
import { createApiCalls } from '../../../../services/secureVerification';
import SecureVerificationModal from '../../../common/modals/SecureVerificationModal';
import AccessTokenDialog from './AccessTokenDialog';

const { Text, Paragraph } = Typography;

/**
 * 访问令牌（scoped access tokens）管理。契约来源：
 * - GET    /api/user/access_tokens            -> { items: [...], legacy: {...}|null }
 * - GET    /api/user/access_tokens/catalog    -> { groups, max_tokens, default_expiry_days }
 * - POST   /api/user/access_tokens            -> { token, item }（token 只返回一次）
 * - PATCH  /api/user/access_tokens/:id        -> 改名不需 proof；改权限需 proof
 * - DELETE /api/user/access_tokens/:id        -> 需 proof
 * - DELETE /api/user/access_tokens/legacy     -> 需 proof
 * 安全验证 scope：access_token.generate / access_token.update / access_token.revoke
 */
const AccessTokensCard = ({ t: tProp }) => {
  const { t: tI18n } = useTranslation();
  const t = tProp || tI18n;

  const [tokens, setTokens] = useState([]);
  const [legacy, setLegacy] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialog, setDialog] = useState({
    visible: false,
    mode: 'create',
    token: null,
  });
  const [issuedToken, setIssuedToken] = useState(null);

  // 每个操作的成功回调不同，用 ref 承接当前操作的结果
  const successHandlerRef = useRef(null);
  const {
    isModalVisible,
    verificationMethods,
    verificationState,
    startVerification,
    executeVerification,
    cancelVerification,
    setVerificationCode,
    setVerificationPassword,
    switchVerificationMethod,
  } = useSecureVerification({
    onSuccess: (result) => {
      const handler = successHandlerRef.current;
      successHandlerRef.current = null;
      if (handler) handler(result);
    },
  });

  // 用户取消验证不会走 onSuccess，提交态只能在这里落地，
  // 否则创建对话框的确认按钮会一直转圈，卡片上的按钮也停在禁用态。
  const cancelSecureVerification = useCallback(() => {
    successHandlerRef.current = null;
    setSubmitting(false);
    cancelVerification();
  }, [cancelVerification]);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/access_tokens');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('获取访问令牌失败'));
        return;
      }
      setTokens(Array.isArray(data?.items) ? data.items : []);
      setLegacy(data?.legacy || null);
    } catch (error) {
      showError(error.message || t('获取访问令牌失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await API.get('/api/user/access_tokens/catalog');
      if (res.data?.success) setCatalog(res.data.data || null);
    } catch (error) {
      // 目录拉取失败只影响权限勾选展示，不阻塞列表
    }
  }, []);

  useEffect(() => {
    loadTokens();
    loadCatalog();
  }, [loadTokens, loadCatalog]);

  // resource:action -> 可读标签，用于列表里的权限展示
  const scopeLabels = useMemo(() => {
    const map = new Map();
    const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
    for (const group of groups) {
      for (const resource of group?.resources || []) {
        for (const action of resource?.actions || []) {
          map.set(
            `${resource.resource}:${action.action}`,
            `${t(resource.label_key)} · ${t(action.label_key)}`,
          );
        }
      }
    }
    return map;
  }, [catalog, t]);

  /** 需要 proof 的请求统一走 createApiCalls.custom：带 X-Security-Proof、
   * 声明单次授权（401 不重放），并返回响应体给 onSuccess。 */
  const customCall = (url, method, data) =>
    createApiCalls.custom(url, method, data);

  const handleCreate = (form) => {
    const expiresAt =
      form.expiryDays > 0
        ? Math.floor(Date.now() / 1000) + form.expiryDays * 86400
        : 0;
    setSubmitting(true);
    successHandlerRef.current = (result) => {
      setSubmitting(false);
      if (result?.success === false) {
        showError(result?.message || t('创建失败'));
        return;
      }
      setDialog({ visible: false, mode: 'create', token: null });
      if (result?.data?.token) setIssuedToken(result.data.token);
      showSuccess(t('访问令牌已创建'));
      loadTokens();
    };
    const started = startVerification(
      customCall('/api/user/access_tokens', 'POST', {
        name: form.name,
        scopes: form.scopes,
        expires_at: expiresAt,
      }),
      {
        scope: 'access_token.generate',
        context: { scopes: form.scopes, expires_at: expiresAt },
        title: t('安全验证'),
        description: t('创建访问令牌需要完成安全验证'),
      },
    );
    started.then((ok) => {
      if (!ok) setSubmitting(false);
    });
  };

  const handleEdit = async (form) => {
    const token = dialog.token;
    if (!token) return;
    const scopesChanged =
      JSON.stringify([...(token.scopes || [])].sort()) !==
      JSON.stringify([...(form.scopes || [])].sort());

    setSubmitting(true);
    // 仅改名不需要 proof
    if (!scopesChanged) {
      try {
        const res = await API.patch(`/api/user/access_tokens/${token.id}`, {
          name: form.name,
        });
        if (!res.data?.success) {
          showError(res.data?.message || t('保存失败'));
          return;
        }
        showSuccess(t('已保存'));
        setDialog({ visible: false, mode: 'create', token: null });
        loadTokens();
      } catch (error) {
        showError(error.message || t('保存失败'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    successHandlerRef.current = (result) => {
      setSubmitting(false);
      if (result?.success === false) {
        showError(result?.message || t('保存失败'));
        return;
      }
      setDialog({ visible: false, mode: 'create', token: null });
      showSuccess(t('已保存'));
      loadTokens();
    };
    const started = startVerification(
      customCall(`/api/user/access_tokens/${token.id}`, 'PATCH', {
        name: form.name,
        scopes: form.scopes,
      }),
      {
        scope: 'access_token.update',
        context: { token_id: token.id, scopes: form.scopes },
        title: t('安全验证'),
        description: t('修改令牌权限需要完成安全验证'),
      },
    );
    started.then((ok) => {
      if (!ok) setSubmitting(false);
    });
  };

  const confirmDelete = (token) => {
    Modal.confirm({
      title: t('删除访问令牌？'),
      content: t('删除后使用该令牌的脚本将立即失效，此操作不可恢复。'),
      onOk: () => {
        setSubmitting(true);
        successHandlerRef.current = (result) => {
          setSubmitting(false);
          if (result?.success === false) {
            showError(result?.message || t('删除失败'));
            return;
          }
          showSuccess(t('已删除'));
          loadTokens();
        };
        return startVerification(
          customCall(`/api/user/access_tokens/${token.id}`, 'DELETE'),
          {
            scope: 'access_token.revoke',
            context: { token_id: token.id },
            title: t('安全验证'),
            description: t('删除访问令牌需要完成安全验证'),
          },
        ).then((ok) => {
          if (!ok) setSubmitting(false);
        });
      },
    });
  };

  const confirmRevokeLegacy = () => {
    Modal.confirm({
      title: t('吊销旧版系统令牌？'),
      content: t('旧版系统令牌会被彻底吊销，使用它的调用将立即失效。'),
      onOk: () => {
        setSubmitting(true);
        successHandlerRef.current = (result) => {
          setSubmitting(false);
          if (result?.success === false) {
            showError(result?.message || t('吊销失败'));
            return;
          }
          showSuccess(t('已吊销旧版系统令牌'));
          loadTokens();
        };
        return startVerification(
          customCall('/api/user/access_tokens/legacy', 'DELETE'),
          {
            scope: 'access_token.revoke',
            context: { legacy: true },
            title: t('安全验证'),
            description: t('吊销旧版系统令牌需要完成安全验证'),
          },
        ).then((ok) => {
          if (!ok) setSubmitting(false);
        });
      },
    });
  };

  const copyIssuedToken = async () => {
    try {
      await navigator.clipboard.writeText(issuedToken);
      showSuccess(t('已复制到剪贴板'));
    } catch (error) {
      showError(t('复制失败，请手动复制'));
    }
  };

  const columns = [
    {
      title: t('名称'),
      dataIndex: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: t('令牌'),
      dataIndex: 'token_hint',
      render: (hint) => <Text code>{`sk-…${hint || ''}`}</Text>,
    },
    {
      title: t('权限'),
      dataIndex: 'scopes',
      render: (scopes) => {
        const list = Array.isArray(scopes) ? scopes : [];
        if (!list.length) return <Text type='tertiary'>-</Text>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {list.slice(0, 4).map((scope) => (
              <Tag key={scope} size='small'>
                {scopeLabels.get(scope) || scope}
              </Tag>
            ))}
            {list.length > 4 ? (
              <Tag size='small' color='grey'>{`+${list.length - 4}`}</Tag>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('有效期'),
      dataIndex: 'expires_at',
      render: (ts) => (ts ? timestamp2string(ts) : t('永不过期')),
    },
    {
      title: t('最后使用'),
      dataIndex: 'last_used_at',
      render: (ts, record) => (
        <div>
          <div>{ts ? timestamp2string(ts) : '-'}</div>
          {record?.last_used_ip ? (
            <Text type='tertiary' size='small'>
              {record.last_used_ip}
            </Text>
          ) : null}
        </div>
      ),
    },
    {
      title: t('操作'),
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            size='small'
            theme='borderless'
            onClick={() =>
              setDialog({ visible: true, mode: 'edit', token: record })
            }
          >
            {t('编辑')}
          </Button>
          <Button
            size='small'
            type='danger'
            theme='borderless'
            disabled={submitting}
            onClick={() => confirmDelete(record)}
          >
            {t('删除')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      title={t('访问令牌')}
      headerExtraContent={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size='small'
            icon={<IconPlus />}
            onClick={() =>
              setDialog({ visible: true, mode: 'create', token: null })
            }
          >
            {t('创建令牌')}
          </Button>
          <Button size='small' icon={<IconRefresh />} onClick={loadTokens} />
        </div>
      }
    >
      <Text
        type='tertiary'
        size='small'
        style={{ display: 'block', marginBottom: 12 }}
      >
        {t('访问令牌用于脚本或第三方工具调用本接口，权限按需最小化授予。')}
      </Text>

      {legacy ? (
        <Banner
          type='warning'
          fullMode={false}
          style={{ marginBottom: 12 }}
          description={
            <div>
              <Text strong>{t('检测到旧版系统令牌')}</Text>
              <div>
                {`${t('令牌')}：sk-…${legacy.token_hint || ''}`}
                {legacy.last_used_at
                  ? ` · ${t('最后使用')}：${timestamp2string(legacy.last_used_at)}`
                  : ''}
              </div>
              <Button
                size='small'
                type='danger'
                style={{ marginTop: 8 }}
                disabled={submitting}
                onClick={confirmRevokeLegacy}
              >
                {t('吊销旧版令牌')}
              </Button>
            </div>
          }
        />
      ) : null}

      <Table
        columns={columns}
        dataSource={tokens}
        rowKey='id'
        loading={loading}
        pagination={false}
        size='small'
        empty={<Empty description={t('暂无访问令牌')} />}
      />

      <AccessTokenDialog
        visible={dialog.visible}
        mode={dialog.mode}
        token={dialog.token}
        catalog={catalog}
        submitting={submitting}
        onCancel={() =>
          setDialog({ visible: false, mode: 'create', token: null })
        }
        onSubmit={dialog.mode === 'edit' ? handleEdit : handleCreate}
      />

      <Modal
        title={t('令牌已创建')}
        visible={!!issuedToken}
        onCancel={() => setIssuedToken(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button icon={<IconCopy />} onClick={copyIssuedToken}>
              {t('复制')}
            </Button>
            <Button type='primary' onClick={() => setIssuedToken(null)}>
              {t('我已保存')}
            </Button>
          </div>
        }
        width={560}
        centered
        closable={false}
        maskClosable={false}
      >
        <Banner
          type='warning'
          fullMode={false}
          description={t('令牌只显示这一次，关闭后无法再次查看，请立即保存。')}
        />
        <Paragraph
          copyable
          style={{
            marginTop: 12,
            padding: 12,
            background: 'var(--semi-color-fill-0)',
            borderRadius: 6,
            wordBreak: 'break-all',
            fontFamily: 'monospace',
          }}
        >
          {issuedToken}
        </Paragraph>
      </Modal>

      <SecureVerificationModal
        visible={isModalVisible}
        verificationMethods={verificationMethods}
        verificationState={verificationState}
        onVerify={executeVerification}
        onCancel={cancelSecureVerification}
        onCodeChange={setVerificationCode}
        onPasswordChange={setVerificationPassword}
        onMethodSwitch={switchVerificationMethod}
        title={verificationState.title}
        description={verificationState.description}
      />
    </Card>
  );
};

export default AccessTokensCard;
