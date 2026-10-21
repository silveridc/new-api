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

import React, { useEffect, useState } from 'react';
import { Button, Modal, Switch, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

/**
 * 重置订阅额度的二次确认框，套餐维度批量重置与单用户重置共用。
 * 开关语义对齐新版 reset-subscriptions-dialog.tsx：默认推进下次重置时间，
 * 每次打开都复位，避免上一次的选择被带到下一个套餐。
 * 关闭时机由调用方决定（onConfirm 成功才关），所以这里用自定义 footer，
 * 不依赖 Semi 对 onOk 返回 Promise 的处理方式。
 */
const ResetQuotaModal = ({ visible, description, onConfirm, onCancel, t }) => {
  const [advanceResetTime, setAdvanceResetTime] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setAdvanceResetTime(true);
      setSubmitting(false);
    }
  }, [visible]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(advanceResetTime);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('重置订阅额度')}
      visible={visible}
      onCancel={onCancel}
      centered
      footer={
        <>
          <Button theme='solid' type='tertiary' onClick={onCancel}>
            {t('取消')}
          </Button>
          <Button
            theme='solid'
            type='danger'
            loading={submitting}
            onClick={handleConfirm}
          >
            {t('确认重置')}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        <Text>{description}</Text>
        <div className='flex items-center justify-between gap-3 rounded-lg border border-solid px-3 py-2'>
          <Text>{t('同时推进下次重置时间')}</Text>
          <Switch
            checked={advanceResetTime}
            onChange={setAdvanceResetTime}
            aria-label={t('同时推进下次重置时间')}
          />
        </div>
      </div>
    </Modal>
  );
};

export default ResetQuotaModal;
