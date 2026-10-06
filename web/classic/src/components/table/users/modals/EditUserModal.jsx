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

import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  getCurrencyConfig,
  isRoot,
  requestVerification,
} from '../../../../helpers';
import {
  quotaToDisplayAmount,
  displayAmountToQuota,
} from '../../../../helpers/quota';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import { normalizeAdminPermissions, permissionMatrixToScopes } from '@/lib/admin-permissions';
import PermissionMatrix from '../../../common/ui/PermissionMatrix';
import {
  adminUpdateVerification,
  resolveProofToken,
  securityProofConfig,
} from '../userSecurity';
import {
  Button,
  Modal,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Form,
  Avatar,
  Row,
  Col,
  InputNumber,
  RadioGroup,
  Radio,
} from '@douyinfe/semi-ui';
import {
  IconUser,
  IconSave,
  IconClose,
  IconLink,
  IconUserGroup,
  IconEdit,
} from '@douyinfe/semi-icons';
import UserBindingManagementModal from './UserBindingManagementModal';

const { Text, Title } = Typography;

/**
 * 计算用户更新的提交意图（纯函数，便于测试）：
 * - 改密码或改权限矩阵 → 需要 admin.user.update proof；
 * - admin_permissions 仅在 root 编辑管理员且矩阵发生变化时携带，
 *   普通资料更新绝不发送该字段（后端看到该字段就会索要 proof）。
 */
export const buildUpdateIntent = ({
  values,
  userId,
  canEditPermissions,
  targetIsAdmin,
  catalog,
  loadedPermissions,
  currentPermissions,
}) => {
  const payload = { ...values };
  delete payload.quota;
  delete payload.quota_amount;
  // 表单残留的矩阵值一律剔除，仅在真实变化时回填
  delete payload.admin_permissions;
  if (userId) {
    payload.id = parseInt(userId, 10);
  }
  let permissionsChanged = false;
  const matrixEditable =
    Boolean(userId) &&
    canEditPermissions &&
    targetIsAdmin &&
    (catalog?.resources?.length || 0) > 0;
  if (matrixEditable) {
    const next = normalizeAdminPermissions(currentPermissions || {}, catalog);
    const before = normalizeAdminPermissions(
      loadedPermissions || {},
      catalog,
    );
    permissionsChanged =
      JSON.stringify(permissionMatrixToScopes(next)) !==
      JSON.stringify(permissionMatrixToScopes(before));
    if (permissionsChanged) {
      payload.admin_permissions = next;
    }
  }
  const needsProof =
    Boolean(userId) && (Boolean(payload.password) || permissionsChanged);
  return {
    payload,
    permissionsChanged,
    verification: needsProof ? adminUpdateVerification(parseInt(userId, 10)) : null,
  };
};

/**
 * 提交用户更新的契约层（纯异步，便于测试）：
 * 带 verification 时先请求 proof，用户取消则不发请求。
 */
export const submitUpdateUser = async ({
  url,
  payload,
  verification,
  verify = requestVerification,
  api = API,
  onSuccess,
  onError,
}) => {
  let config;
  if (verification) {
    const proof = await verify(verification);
    if (!resolveProofToken(proof)) {
      return false; // 用户取消：安静返回，不发请求
    }
    config = securityProofConfig(proof);
  }
  try {
    const res = await api.put(url, payload, config);
    const { success, message } = res.data;
    if (success) {
      onSuccess?.();
      return true;
    }
    onError?.(message);
    return false;
  } catch (error) {
    onError?.(error.message);
    return false;
  }
};

const EditUserModal = (props) => {
  const { t } = useTranslation();
  const userId = props.editingUser.id;
  const [loading, setLoading] = useState(true);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustQuotaLocal, setAdjustQuotaLocal] = useState('');
  const [adjustAmountLocal, setAdjustAmountLocal] = useState('');
  const [adjustMode, setAdjustMode] = useState('add');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const isMobile = useIsMobile();
  const [groupOptions, setGroupOptions] = useState([]);
  const [bindingModalVisible, setBindingModalVisible] = useState(false);
  const formApiRef = useRef(null);
  const [showAdjustQuotaRaw, setShowAdjustQuotaRaw] = useState(false);
  const [showQuotaInput, setShowQuotaInput] = useState(false);
  const [inputs, setInputs] = useState(null);

  const isEdit = Boolean(userId);

  // 管理员权限矩阵：仅 root 可配置管理员目标的 admin_permissions
  const canEditPermissions = isRoot();
  const targetIsAdmin = Number(inputs?.role) >= 10;
  const [permissionCatalog, setPermissionCatalog] = useState({
    resources: [],
    roles: [],
  });
  const [adminPermissions, setAdminPermissions] = useState({});
  const loadedPermissionsRef = useRef(null);

  const getInitValues = () => ({
    username: '',
    display_name: '',
    password: '',
    github_id: '',
    oidc_id: '',
    discord_id: '',
    wechat_id: '',
    telegram_id: '',
    linux_do_id: '',
    email: '',
    quota: 0,
    quota_amount: 0,
    group: 'default',
    remark: '',
  });

  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      setGroupOptions(res.data.data.map((g) => ({ label: g, value: g })));
    } catch (e) {
      showError(e.message);
    }
  };

  const handleCancel = () => props.handleClose();

  const loadUser = async () => {
    setLoading(true);
    const url = userId ? `/api/user/${userId}` : `/api/user/self`;
    const res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      data.password = '';
      data.quota_amount = Number(
        quotaToDisplayAmount(data.quota || 0).toFixed(6),
      );
      loadedPermissionsRef.current = data.admin_permissions || null;
      setAdminPermissions(data.admin_permissions || {});
      setInputs({ ...getInitValues(), ...data });
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // 拉取权限目录（资源、动作与角色基线），仅 root 编辑时需要
  const fetchPermissionCatalog = async () => {
    if (!canEditPermissions || !userId) {
      return;
    }
    try {
      const res = await API.get('/api/authz/catalog');
      const data = res.data?.data || {};
      setPermissionCatalog({
        resources: data.resources || [],
        roles: data.roles || [],
      });
    } catch (error) {
      // 目录不可用时隐藏矩阵，不发送 admin_permissions
      setPermissionCatalog({ resources: [], roles: [] });
    }
  };

  useEffect(() => {
    if (inputs && formApiRef.current) {
      formApiRef.current.setValues(inputs);
    }
  }, [inputs]);

  useEffect(() => {
    loadUser();
    if (userId) fetchGroups();
    fetchPermissionCatalog();
    setBindingModalVisible(false);
  }, [props.editingUser.id]);

  const openBindingModal = () => {
    setBindingModalVisible(true);
  };

  const closeBindingModal = () => {
    setBindingModalVisible(false);
  };

  /* ----------------------- submit ----------------------- */
  const submit = async (values) => {
    setLoading(true);
    try {
      const intent = buildUpdateIntent({
        values,
        userId,
        canEditPermissions,
        targetIsAdmin,
        catalog: permissionCatalog,
        loadedPermissions: loadedPermissionsRef.current,
        currentPermissions: adminPermissions,
      });
      await submitUpdateUser({
        url: userId ? `/api/user/` : `/api/user/self`,
        payload: intent.payload,
        verification: intent.verification,
        onSuccess: () => {
          showSuccess(t('用户信息更新成功！'));
          props.refresh();
          props.handleClose();
        },
        onError: (message) => showError(message),
      });
    } finally {
      setLoading(false);
    }
  };

  /* --------------------- atomic quota adjust -------------------- */
  const adjustQuota = async () => {
    const quotaVal = parseInt(adjustQuotaLocal) || 0;
    if (quotaVal <= 0 && adjustMode !== 'override') return;
    if (adjustMode === 'override' && (adjustQuotaLocal === '' || adjustQuotaLocal == null)) return;
    setAdjustLoading(true);
    try {
      const res = await API.post('/api/user/manage', {
        id: parseInt(userId),
        action: 'add_quota',
        mode: adjustMode,
        value: adjustMode === 'override' ? quotaVal : Math.abs(quotaVal),
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('调整额度成功'));
        setAdjustModalOpen(false);
        setAdjustQuotaLocal('');
        setAdjustAmountLocal('');
        const userRes = await API.get(`/api/user/${userId}`);
        if (userRes.data.success) {
          const data = userRes.data.data;
          data.password = '';
          data.quota_amount = Number(
            quotaToDisplayAmount(data.quota || 0).toFixed(6),
          );
          setInputs({ ...getInitValues(), ...data });
        }
        props.refresh();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setAdjustLoading(false);
  };

  const getPreviewText = () => {
    const current = formApiRef.current?.getValue('quota') || 0;
    const val = parseInt(adjustQuotaLocal) || 0;
    let result;
    switch (adjustMode) {
      case 'add':
        result = current + Math.abs(val);
        return `${t('当前额度')}：${renderQuota(current)}，+${renderQuota(Math.abs(val))} = ${renderQuota(result)}`;
      case 'subtract':
        result = current - Math.abs(val);
        return `${t('当前额度')}：${renderQuota(current)}，-${renderQuota(Math.abs(val))} = ${renderQuota(result)}`;
      case 'override':
        return `${t('当前额度')}：${renderQuota(current)} → ${renderQuota(val)}`;
      default:
        return '';
    }
  };

  /* --------------------------- UI --------------------------- */
  return (
    <>
      <SideSheet
        placement='right'
        title={
          <Space>
            <Tag color='blue' shape='circle'>
              {t(isEdit ? '编辑' : '新建')}
            </Tag>
            <Title heading={4} className='m-0'>
              {isEdit ? t('编辑用户') : t('创建用户')}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
        visible={props.visible}
        width={isMobile ? '100%' : 600}
        footer={
          <div className='flex justify-end bg-white'>
            <Space>
              <Button
                theme='solid'
                onClick={() => formApiRef.current?.submitForm()}
                icon={<IconSave />}
                loading={loading}
              >
                {t('提交')}
              </Button>
              <Button
                theme='light'
                type='primary'
                onClick={handleCancel}
                icon={<IconClose />}
              >
                {t('取消')}
              </Button>
            </Space>
          </div>
        }
        closeIcon={null}
        onCancel={handleCancel}
      >
        <Spin spinning={loading}>
          <Form
            initValues={getInitValues()}
            getFormApi={(api) => (formApiRef.current = api)}
            onSubmit={submit}
          >
            {({ values }) => (
              <div className='p-2 space-y-3'>
                {/* 基本信息 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar
                      size='small'
                      color='blue'
                      className='mr-2 shadow-md'
                    >
                      <IconUser size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('基本信息')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('用户的基本账户信息')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Input
                        field='username'
                        label={t('用户名')}
                        placeholder={t('请输入新的用户名')}
                        rules={[{ required: true, message: t('请输入用户名') }]}
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='password'
                        label={t('密码')}
                        placeholder={t('请输入新的密码，最短 8 位')}
                        mode='password'
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='display_name'
                        label={t('显示名称')}
                        placeholder={t('请输入新的显示名称')}
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='remark'
                        label={t('备注')}
                        placeholder={t('请输入备注（仅管理员可见）')}
                        showClear
                      />
                    </Col>
                  </Row>
                </Card>

                {/* 权限设置 */}
                {userId && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='green'
                        className='mr-2 shadow-md'
                      >
                        <IconUserGroup size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('权限设置')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('用户分组和额度管理')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Select
                          field='group'
                          label={t('分组')}
                          placeholder={t('请选择分组')}
                          optionList={groupOptions}
                          allowAdditions
                          search
                          rules={[{ required: true, message: t('请选择分组') }]}
                        />
                      </Col>

                      <Col span={10}>
                        <Form.InputNumber
                          field='quota_amount'
                          label={t('金额')}
                          prefix={getCurrencyConfig().symbol}
                          precision={6}
                          step={0.000001}
                          style={{ width: '100%' }}
                          readonly
                        />
                      </Col>

                      <Col span={14}>
                        <Form.Slot label={t('调整额度')}>
                          <Button
                            icon={<IconEdit />}
                            onClick={() => setAdjustModalOpen(true)}
                          >
                            {t('调整额度')}
                          </Button>
                        </Form.Slot>
                      </Col>

                      <Col span={24}>
                        <div
                          className='text-xs cursor-pointer'
                          style={{ color: 'var(--semi-color-text-2)' }}
                          onClick={() => setShowQuotaInput((v) => !v)}
                        >
                          {showQuotaInput
                            ? `▾ ${t('收起原生额度输入')}`
                            : `▸ ${t('使用原生额度输入')}`}
                        </div>
                        <div style={{ display: showQuotaInput ? 'block' : 'none' }} className='mt-2'>
                          <Form.InputNumber
                            field='quota'
                            label={t('额度')}
                            placeholder={t('请输入额度')}
                            style={{ width: '100%' }}
                            readonly
                          />
                        </div>
                      </Col>
                    </Row>
                  </Card>
                )}

                {/* 管理员权限矩阵：仅 root 编辑管理员时可见 */}
                {userId && canEditPermissions && targetIsAdmin &&
                  permissionCatalog.resources.length > 0 && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='pink'
                        className='mr-2 shadow-md'
                      >
                        <IconUserGroup size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('管理员权限')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('按资源与动作配置该管理员的管理权限')}
                        </div>
                      </div>
                    </div>
                    <PermissionMatrix
                      resources={permissionCatalog.resources}
                      value={normalizeAdminPermissions(
                        adminPermissions,
                        permissionCatalog,
                      )}
                      onChange={setAdminPermissions}
                    />
                  </Card>
                )}

                {/* 绑定信息入口 */}
                {userId && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='flex items-center min-w-0'>
                        <Avatar
                          size='small'
                          color='purple'
                          className='mr-2 shadow-md'
                        >
                          <IconLink size={16} />
                        </Avatar>
                        <div className='min-w-0'>
                          <Text className='text-lg font-medium'>
                            {t('绑定信息')}
                          </Text>
                          <div className='text-xs text-gray-600'>
                            {t('管理用户已绑定的第三方账户，支持筛选与解绑')}
                          </div>
                        </div>
                      </div>
                      <Button
                        type='primary'
                        theme='outline'
                        onClick={openBindingModal}
                      >
                        {t('管理绑定')}
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Form>
        </Spin>
      </SideSheet>

      <UserBindingManagementModal
        visible={bindingModalVisible}
        onCancel={closeBindingModal}
        userId={userId}
        isMobile={isMobile}
        formApiRef={formApiRef}
      />

      {/* 调整额度模态框 */}
      <Modal
        centered
        visible={adjustModalOpen}
        onOk={adjustQuota}
        onCancel={() => {
          setAdjustModalOpen(false);
          setAdjustQuotaLocal('');
          setAdjustAmountLocal('');
          setAdjustMode('add');
        }}
        confirmLoading={adjustLoading}
        closable={null}
        title={
          <div className='flex items-center'>
            <IconEdit className='mr-2' />
            {t('调整额度')}
          </div>
        }
      >
        <div className='mb-4'>
          <Text type='secondary' className='block mb-2'>
            {getPreviewText()}
          </Text>
        </div>
        <div className='mb-3'>
          <div className='mb-1'>
            <Text size='small'>{t('操作')}</Text>
          </div>
          <RadioGroup
            type='button'
            value={adjustMode}
            onChange={(e) => {
              setAdjustMode(e.target.value);
              setAdjustQuotaLocal('');
              setAdjustAmountLocal('');
            }}
            style={{ width: '100%' }}
          >
            <Radio value='add'>{t('添加')}</Radio>
            <Radio value='subtract'>{t('减少')}</Radio>
            <Radio value='override'>{t('覆盖')}</Radio>
          </RadioGroup>
        </div>
        <div className='mb-3'>
          <div className='mb-1'>
            <Text size='small'>{t('金额')}</Text>
          </div>
          <InputNumber
            prefix={getCurrencyConfig().symbol}
            placeholder={t('输入金额')}
            value={adjustAmountLocal}
            precision={6}
            min={adjustMode === 'override' ? undefined : 0}
            step={0.000001}
            onChange={(val) => {
              const amount = val === '' || val == null ? '' : val;
              setAdjustAmountLocal(amount);
              setAdjustQuotaLocal(
                amount === ''
                  ? ''
                  : adjustMode === 'override'
                    ? displayAmountToQuota(amount)
                    : displayAmountToQuota(Math.abs(amount)),
              );
            }}
            style={{ width: '100%' }}
            showClear
          />
        </div>
        <div
          className='text-xs cursor-pointer mt-2'
          style={{ color: 'var(--semi-color-text-2)' }}
          onClick={() => setShowAdjustQuotaRaw((v) => !v)}
        >
          {showAdjustQuotaRaw
            ? `▾ ${t('收起原生额度输入')}`
            : `▸ ${t('使用原生额度输入')}`}
        </div>
        <div style={{ display: showAdjustQuotaRaw ? 'block' : 'none' }} className='mt-2'>
          <div className='mb-1'>
            <Text size='small'>{t('额度')}</Text>
          </div>
          <InputNumber
            placeholder={t('输入额度')}
            value={adjustQuotaLocal}
            min={adjustMode === 'override' ? undefined : 0}
            onChange={(val) => {
              const quota = val === '' || val == null ? '' : val;
              setAdjustQuotaLocal(quota);
              setAdjustAmountLocal(
                quota === ''
                  ? ''
                  : adjustMode === 'override'
                    ? Number(quotaToDisplayAmount(quota).toFixed(6))
                    : Number(quotaToDisplayAmount(Math.abs(quota)).toFixed(6)),
              );
            }}
            style={{ width: '100%' }}
            showClear
            step={500000}
          />
        </div>
      </Modal>
    </>
  );
};

export default EditUserModal;
