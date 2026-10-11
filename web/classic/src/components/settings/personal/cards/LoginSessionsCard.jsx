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
  Button,
  Card,
  Empty,
  Modal,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, timestamp2string } from '../../../../helpers';

const { Text } = Typography;

/**
 * 登录会话管理。契约来源：
 * - GET    /api/user/sessions                     -> data: LoginSessionView[]
 * - DELETE /api/user/sessions/:sid                -> 下线单个会话
 * - POST   /api/user/sessions/revoke-others       -> 下线除当前外的全部会话
 * 字段：{ sid, current, login_method, ip, user_agent, created_at, last_active_at, expires_at }
 */

/**
 * 把 User-Agent 压成「浏览器 · 系统」形式，无法识别时回退原文或未知设备。
 * 与新版前端 login-session-utils 的 sessionDevice 保持一致的判定顺序。
 */
export function sessionDeviceLabel(userAgent, unknownLabel, maxTouchPoints = 0) {
  if (!userAgent) return unknownLabel;
  let browser = '';
  if (userAgent.includes('Edg/')) browser = 'Edge';
  else if (userAgent.includes('Chrome/')) browser = 'Chrome';
  else if (userAgent.includes('Firefox/')) browser = 'Firefox';
  else if (userAgent.includes('Safari/')) browser = 'Safari';

  let system = '';
  const isIPad =
    userAgent.includes('iPad') ||
    (userAgent.includes('Macintosh') && maxTouchPoints > 1);
  if (userAgent.includes('iPhone') || isIPad) system = 'iOS';
  else if (userAgent.includes('Android')) system = 'Android';
  else if (userAgent.includes('Windows')) system = 'Windows';
  else if (userAgent.includes('Mac OS')) system = 'macOS';
  else if (userAgent.includes('Linux')) system = 'Linux';

  if (browser && system) return `${browser} · ${system}`;
  if (browser) return browser;
  if (system) return system;
  return userAgent;
}

/** 登录方式展示：oauth:<provider> 形式保留提供方名称。 */
export function loginMethodLabel(method, t) {
  const normalized = String(method || '').trim().toLowerCase();
  switch (normalized) {
    case 'password':
      return t('密码登录');
    case '2fa':
      return t('两步验证');
    case 'passkey':
      return 'Passkey';
    case 'oauth':
      return 'OAuth';
    case 'unknown':
    case '':
      return t('未知');
    default:
      break;
  }
  if (!normalized.startsWith('oauth:')) return method;
  const provider = normalized.slice('oauth:'.length);
  const names = {
    discord: 'Discord',
    github: 'GitHub',
    linuxdo: 'LinuxDO',
    oidc: 'OIDC',
  };
  return `OAuth · ${names[provider] || provider}`;
}

const LoginSessionsCard = ({ t }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/sessions');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('获取登录会话失败'));
        return;
      }
      setSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      showError(error.message || t('获取登录会话失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const confirmRevokeOne = (record) => {
    Modal.confirm({
      title: t('确认下线该会话？'),
      content: t('该设备将立即退出登录，需要重新登录后才能继续使用。'),
      onOk: async () => {
        setRevoking(true);
        try {
          const res = await API.delete(`/api/user/sessions/${record.sid}`);
          if (!res.data?.success) {
            showError(res.data?.message || t('下线失败'));
            return;
          }
          showSuccess(t('已下线该会话'));
          await loadSessions();
        } catch (error) {
          showError(error.message || t('下线失败'));
        } finally {
          setRevoking(false);
        }
      },
    });
  };

  const confirmRevokeOthers = () => {
    Modal.confirm({
      title: t('下线其他所有会话？'),
      content: t('除当前设备外的所有登录会话都将退出，需要重新登录。'),
      onOk: async () => {
        setRevoking(true);
        try {
          const res = await API.post('/api/user/sessions/revoke-others');
          if (!res.data?.success) {
            showError(res.data?.message || t('下线失败'));
            return;
          }
          showSuccess(t('已下线其他所有会话'));
          await loadSessions();
        } catch (error) {
          showError(error.message || t('下线失败'));
        } finally {
          setRevoking(false);
        }
      },
    });
  };

  const hasOthers = sessions.some((item) => !item?.current);

  const columns = [
    {
      title: t('设备'),
      dataIndex: 'user_agent',
      render: (userAgent, record) => (
        <div>
          <Text strong>
            {sessionDeviceLabel(
              userAgent,
              t('未知设备'),
              typeof navigator !== 'undefined'
                ? navigator.maxTouchPoints || 0
                : 0,
            )}
          </Text>
          {record?.current ? (
            <Tag color='green' style={{ marginLeft: 8 }}>
              {t('当前会话')}
            </Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: t('登录方式'),
      dataIndex: 'login_method',
      render: (method) => loginMethodLabel(method, t),
    },
    { title: t('IP 地址'), dataIndex: 'ip', render: (ip) => ip || '-' },
    {
      title: t('登录时间'),
      dataIndex: 'created_at',
      render: (ts) => (ts ? timestamp2string(ts) : '-'),
    },
    {
      title: t('最后活跃'),
      dataIndex: 'last_active_at',
      render: (ts) => (ts ? timestamp2string(ts) : '-'),
    },
    {
      title: t('操作'),
      render: (_, record) =>
        record?.current ? (
          <Text type='tertiary' size='small'>
            -
          </Text>
        ) : (
          <Button
            size='small'
            type='danger'
            theme='borderless'
            disabled={revoking}
            onClick={() => confirmRevokeOne(record)}
          >
            {t('下线')}
          </Button>
        ),
    },
  ];

  return (
    <Card
      title={t('登录会话')}
      headerExtraContent={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size='small'
            type='danger'
            disabled={!hasOthers || revoking}
            onClick={confirmRevokeOthers}
          >
            {t('下线其他设备')}
          </Button>
          <Button size='small' icon={<IconRefresh />} onClick={loadSessions} />
        </div>
      }
    >
      <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 12 }}>
        {t('这里列出当前账号的所有登录会话；发现异常设备可立即下线。')}
      </Text>
      <Table
        columns={columns}
        dataSource={sessions}
        rowKey='sid'
        loading={loading}
        pagination={false}
        size='small'
        empty={<Empty description={t('暂无登录会话')} />}
      />
    </Card>
  );
};

export default LoginSessionsCard;
