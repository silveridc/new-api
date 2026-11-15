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

import React from 'react';
import { Button, Checkbox, Modal } from '@douyinfe/semi-ui';

const AuditColumnSelectorModal = (props) => {
  const selectableColumns = props.columns.filter(
    (column) => column.key !== 'username' || props.canReadAll,
  );
  const allSelected = selectableColumns.every(
    (column) => props.visibleColumns[column.key],
  );
  const someSelected = selectableColumns.some(
    (column) => props.visibleColumns[column.key],
  );

  return (
    <Modal
      title={props.t('列设置')}
      visible={props.visible}
      onCancel={props.onClose}
      footer={
        <div className='flex justify-end gap-2'>
          <Button onClick={props.onReset}>{props.t('重置')}</Button>
          <Button onClick={props.onClose}>{props.t('取消')}</Button>
          <Button type='primary' theme='solid' onClick={props.onClose}>
            {props.t('确定')}
          </Button>
        </div>
      }
    >
      <div className='mb-3'>
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={(event) => props.onSelectAll(event.target.checked)}
        >
          {props.t('全选')}
        </Checkbox>
      </div>
      <div
        className='flex flex-wrap max-h-96 overflow-y-auto rounded-lg p-4'
        style={{ border: '1px solid var(--semi-color-border)' }}
      >
        {selectableColumns.map((column) => (
          <div key={column.key} className='w-1/2 mb-4 pr-2'>
            <Checkbox
              checked={Boolean(props.visibleColumns[column.key])}
              onChange={(event) =>
                props.onColumnVisibilityChange(column.key, event.target.checked)
              }
            >
              {column.title}
            </Checkbox>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default AuditColumnSelectorModal;
