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
import {
  Banner,
  Button,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '../../../../helpers';
import {
  VENDOR_ACTION,
  applyVendorOperation,
  getVendorErrorText,
  previewVendorOperation,
} from '../../../../services/vendors';

const { Text } = Typography;

/**
 * 供应商批量操作对话框。契约要求先 preview 拿到 version，再带 expected_version
 * 执行 apply；预览本身不写库，因此每次选择变化都要重新预览。
 * operation = {action, vendor_ids} 或 {action: 'assign', model_ids}。
 */
const VendorOperationModal = ({
  visible,
  operation,
  vendors,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [targetVendorId, setTargetVendorId] = useState(undefined);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const action = operation?.action;
  const vendorIds = useMemo(
    () => (operation?.vendor_ids || []).filter((id) => id !== undefined),
    [operation],
  );
  const modelIds = useMemo(
    () => (operation?.model_ids || []).filter((id) => id !== undefined),
    [operation],
  );

  useEffect(() => {
    if (visible) {
      setTargetVendorId(undefined);
      setPreview(null);
      setError(null);
      setBusy(false);
    }
  }, [visible, operation]);

  const isDelete = action === VENDOR_ACTION.delete;
  const isMerge = action === VENDOR_ACTION.merge;

  const targetOptions = useMemo(() => {
    const options = (vendors || [])
      .filter((vendor) => !vendorIds.includes(vendor.id))
      .map((vendor) => ({ label: vendor.name, value: vendor.id }));
    if (action === VENDOR_ACTION.assign) {
      options.unshift({ label: t('无供应商'), value: 0 });
    }
    return options;
  }, [vendors, vendorIds, action, t]);

  const canPreview =
    !busy &&
    (isDelete
      ? vendorIds.length > 0
      : targetVendorId !== undefined &&
        (isMerge ? vendorIds.length > 0 : modelIds.length > 0));

  const buildRequest = () => ({
    action,
    vendor_ids: vendorIds,
    model_ids: modelIds,
    target_vendor_id: isDelete ? undefined : targetVendorId,
  });

  const handlePreview = async () => {
    if (!canPreview) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewVendorOperation(buildRequest()));
    } catch (err) {
      setPreview(null);
      setError(err);
    }
    setBusy(false);
  };

  const handleApply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await applyVendorOperation({
        ...buildRequest(),
        expected_version: preview.version,
      });
      const models = (result?.updated_models || []).length;
      const deleted = (result?.deleted_vendors || []).length;
      showSuccess(
        isDelete
          ? t('已删除 {{vendors}} 条供应商记录。', { vendors: deleted })
          : isMerge
            ? t(
                '已合并供应商：转移 {{models}} 个模型，删除 {{vendors}} 条供应商记录。',
                { models, vendors: deleted },
              )
            : t('已更新 {{models}} 个模型的供应商归属。', { models }),
      );
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err);
      setPreview(null);
    }
    setBusy(false);
  };

  const title = isDelete
    ? t('删除供应商')
    : isMerge
      ? t('合并供应商')
      : t('变更模型供应商');

  const previewModelColumns = [
    {
      title: t('模型名称'),
      dataIndex: 'model_name',
    },
    {
      title: t('当前供应商'),
      dataIndex: 'vendor_name',
      render: (text) => text || t('无供应商'),
    },
    {
      title: t('目标供应商'),
      dataIndex: 'target',
      render: () => preview?.target?.name || t('无供应商'),
    },
  ];

  const previewVendorColumns = [
    { title: t('供应商'), dataIndex: 'name' },
    {
      title: t('计划操作'),
      dataIndex: 'action',
      render: () => (isDelete ? t('删除供应商记录') : t('转移模型归属')),
    },
  ];

  return (
    <Modal
      title={title}
      visible={visible}
      onCancel={busy ? undefined : onClose}
      maskClosable={!busy}
      width={680}
      footer={
        <Space>
          <Button onClick={onClose} disabled={busy}>
            {t('取消')}
          </Button>
          {!preview && (
            <Button
              type='primary'
              onClick={handlePreview}
              loading={busy}
              disabled={!canPreview}
            >
              {t('预览变更')}
            </Button>
          )}
          {preview && (
            <Button
              type='danger'
              theme='solid'
              onClick={handleApply}
              loading={busy}
            >
              {t('应用变更')}
            </Button>
          )}
        </Space>
      }
    >
      <div className='flex flex-col gap-3'>
        {isDelete ? (
          <Text type='tertiary'>
            {t(
              '确定删除所选 {{count}} 条供应商记录？仍关联模型的供应商无法删除。',
              {
                count: vendorIds.length,
              },
            )}
          </Text>
        ) : (
          <div className='flex items-center gap-2'>
            <Text>{isMerge ? t('保留此供应商') : t('目标供应商')}</Text>
            <Select
              className='flex-1'
              filter
              showClear
              disabled={busy}
              placeholder={t('请选择供应商')}
              optionList={targetOptions}
              value={targetVendorId}
              onChange={(value) => {
                setTargetVendorId(value);
                setPreview(null);
                setError(null);
              }}
            />
          </div>
        )}
        {isMerge && (
          <Text type='tertiary' size='small'>
            {t(
              '源供应商的模型归属转移完成后会被删除，目标供应商的信息保持不变。',
            )}
          </Text>
        )}
        {preview ? (
          <>
            <Banner
              type='info'
              description={
                <div className='flex flex-col gap-1'>
                  <Text>
                    {t('源供应商：')}
                    {preview.sources?.map((vendor) => vendor.name).join('、') ||
                      t('无供应商')}
                  </Text>
                  {!isDelete && (
                    <Text>
                      {t('目标供应商：')}
                      {preview.target?.name || t('无供应商')}
                    </Text>
                  )}
                  <Text>
                    {t('受影响模型记录：{{count}} 条', {
                      count: preview.models?.length || 0,
                    })}
                  </Text>
                </div>
              }
            />
            <Table
              size='small'
              columns={isDelete ? previewVendorColumns : previewModelColumns}
              dataSource={
                isDelete ? preview.sources || [] : preview.models || []
              }
              rowKey={(record) => record.id}
              pagination={false}
              scroll={{ y: 280 }}
            />
          </>
        ) : (
          <Text type='tertiary' size='small'>
            {t(
              '请先预览变更，确认无误后再执行。模型价格、渠道与模型名称不受影响。',
            )}
          </Text>
        )}
        {error && (
          <Banner
            type='danger'
            description={getVendorErrorText(error, t)}
            closeIcon={null}
          />
        )}
      </div>
    </Modal>
  );
};

export default VendorOperationModal;
