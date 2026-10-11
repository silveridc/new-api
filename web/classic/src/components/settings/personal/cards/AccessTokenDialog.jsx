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

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Select, Spin, Typography } from '@douyinfe/semi-ui';
import PermissionMatrix from '../../../common/ui/PermissionMatrix';
import {
  permissionMatrixToScopes,
  scopesToPermissionMatrix,
} from '@/lib/admin-permissions';

const { Text } = Typography;

const EXPIRY_OPTIONS = [
  { value: 0, label: '永不过期' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 365, label: '365 天' },
];

/**
 * 访问令牌创建/编辑对话框。
 * - 名称必填（1-64 字符，后端校验）
 * - 权限矩阵来自 /api/user/access_tokens/catalog 的 groups（按 group 平铺为资源列表）
 * - 创建与改权限需要安全验证（proof），由父组件传入 onSubmit，父组件负责 proof 流程
 */
const AccessTokenDialog = ({
  visible,
  mode = 'create',
  token = null,
  catalog = null,
  submitting = false,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [expiryDays, setExpiryDays] = useState(90);
  const [permissions, setPermissions] = useState({});

  const resources = useMemo(() => {
    const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
    return groups.flatMap((group) =>
      Array.isArray(group?.resources) ? group.resources : [],
    );
  }, [catalog]);

  // 打开时按模式回填：编辑模式还原名称与已有权限
  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && token) {
      setName(token.name || '');
      setPermissions(scopesToPermissionMatrix(token.scopes || []));
      return;
    }
    setName('');
    setExpiryDays(90);
    setPermissions({});
  }, [visible, mode, token]);

  const scopes = useMemo(
    () => permissionMatrixToScopes(permissions),
    [permissions],
  );

  const handleOk = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      scopes,
      expiryDays: mode === 'create' ? Number(expiryDays) || 0 : undefined,
    });
  };

  return (
    <Modal
      title={mode === 'edit' ? t('编辑访问令牌') : t('创建访问令牌')}
      visible={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={mode === 'edit' ? t('保存') : t('创建')}
      cancelText={t('取消')}
      okButtonProps={{ disabled: !name.trim() || scopes.length === 0 }}
      width={640}
      centered
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Text strong>{t('名称')}</Text>
          <Input
            value={name}
            onChange={setName}
            maxLength={64}
            placeholder={t('例如：CI 部署、监控脚本')}
            style={{ marginTop: 8 }}
          />
        </div>

        {mode === 'create' && (
          <div>
            <Text strong>{t('有效期')}</Text>
            <Select
              value={expiryDays}
              onChange={(value) => setExpiryDays(value)}
              optionList={EXPIRY_OPTIONS.map((option) => ({
                ...option,
                label: t(option.label),
              }))}
              style={{ width: '100%', marginTop: 8 }}
            />
          </div>
        )}

        <div>
          <Text strong>{t('权限')}</Text>
          <div className='text-xs text-gray-600' style={{ marginTop: 4, marginBottom: 8 }}>
            {t('令牌只能用于勾选的权限；创建与修改权限都需要完成安全验证。')}
          </div>
          {resources.length === 0 ? (
            <Spin />
          ) : (
            <PermissionMatrix
              resources={resources}
              value={permissions}
              onChange={setPermissions}
            />
          )}
          {resources.length > 0 && scopes.length === 0 ? (
            <Text type='danger' size='small'>
              {t('请至少选择一项权限')}
            </Text>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

export default AccessTokenDialog;
