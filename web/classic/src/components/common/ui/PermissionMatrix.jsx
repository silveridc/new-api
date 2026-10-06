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

import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

/**
 * 管理员权限矩阵（受控组件）。
 *
 * 数据结构来自后端 GET /api/authz/catalog：
 *   resources: [{ resource, label_key, actions: [{ action, label_key, description_key }] }]
 *   value:     { [resource]: { [action]: boolean } }
 *
 * - 逐项（resource × action）勾选，勾选结果通过 onChange 整体回传；
 * - 仅 catalog 中登记的项可勾选；value 里存在但 catalog 未登记的项视为
 *   后端不可授予，渲染为禁用勾选框（只展示，不可修改）；
 * - 每个资源分组带 role='group' + aria-label，Checkbox 文本由原生 label
 *   关联，动作描述通过 aria-describedby 暴露，键盘可直接操作。
 */
const PermissionMatrix = ({
  resources = [],
  value = {},
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const idPrefix = useId().replace(/:/g, '-');

  const toggle = (resourceKey, actionKey, checked) => {
    if (typeof onChange !== 'function') {
      return;
    }
    onChange({
      ...value,
      [resourceKey]: {
        ...value[resourceKey],
        [actionKey]: checked,
      },
    });
  };

  const renderCheckbox = (resourceKey, actionDef) => {
    const checked = value?.[resourceKey]?.[actionDef.action] === true;
    const descriptionId = `${idPrefix}-${resourceKey}-${actionDef.action}-desc`;
    return (
      <span key={actionDef.action} className='inline-flex items-center'>
        <Checkbox
          checked={checked}
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(e) =>
            toggle(resourceKey, actionDef.action, e.target.checked)
          }
        >
          {t(actionDef.label_key)}
        </Checkbox>
        {/* Semi Checkbox 通过 aria-describedby 关联该隐藏描述 */}
        <span id={descriptionId} className='sr-only'>
          {t(actionDef.description_key)}
        </span>
      </span>
    );
  };

  // catalog 未登记、但 value 中残留的项：后端已不可授予，禁用展示
  const staleEntries = [];
  Object.entries(value || {}).forEach(([resourceKey, actions]) => {
    const known = resources.some((r) => r.resource === resourceKey);
    if (!known && actions) {
      Object.keys(actions).forEach((actionKey) => {
        staleEntries.push({ resourceKey, actionKey, granted: actions[actionKey] === true });
      });
    }
  });

  return (
    <div className='flex flex-col divide-y'>
      {resources.map((resourceDef) => (
        <div
          key={resourceDef.resource}
          role='group'
          aria-label={t(resourceDef.label_key)}
          className='flex flex-col gap-2 py-2'
        >
          <Text strong>{t(resourceDef.label_key)}</Text>
          <div className='flex flex-wrap gap-x-4 gap-y-2'>
            {(resourceDef.actions || []).map((actionDef) =>
              renderCheckbox(resourceDef.resource, actionDef),
            )}
          </div>
        </div>
      ))}
      {staleEntries.length > 0 && (
        <div
          role='group'
          aria-label={t('不可授予的权限')}
          className='flex flex-col gap-2 py-2'
        >
          <Text strong type='tertiary'>
            {t('不可授予的权限')}
          </Text>
          <div className='flex flex-wrap gap-x-4 gap-y-2'>
            {staleEntries.map((entry) => {
              const descriptionId = `${idPrefix}-${entry.resourceKey}-${entry.actionKey}-stale-desc`;
              const label = `${entry.resourceKey}:${entry.actionKey}`;
              return (
                <span key={label} className='inline-flex items-center'>
                  <Checkbox
                    checked={entry.granted}
                    disabled
                    aria-describedby={descriptionId}
                    onChange={() => {}}
                  >
                    {label}
                  </Checkbox>
                  <span id={descriptionId} className='sr-only'>
                    {t('该权限不在后端权限目录中，无法在此授予或收回')}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PermissionMatrix;
