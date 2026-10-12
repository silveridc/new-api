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

import React, { useMemo } from 'react';
import { Button, Select, Tag, Typography } from '@douyinfe/semi-ui';
import {
  IconChevronUp,
  IconChevronDown,
  IconClose,
  IconRefresh,
} from '@douyinfe/semi-icons';

const { Text } = Typography;

/**
 * 令牌 Auto 分组顺序编辑器（受控组件）。契约见 services/tokenAutoGroups.js。
 * inherit：只读展示全局 Auto 顺序预览；custom：可增删/排序的分组链（上限 maxCount）。
 * 仅在令牌分组为 auto 时由 EditTokenModal 渲染；通过 onChange 把 {groups, mode}
 * 同步回表单。candidateOptions 为当前可选分组（不含 auto），globalOrder 为全局顺序。
 */
const TokenAutoGroupEditor = ({
  value = [],
  mode = 'inherit',
  maxCount = 5,
  candidateOptions = [],
  globalOrder = [],
  onChange,
  t,
}) => {
  const optionByValue = useMemo(() => {
    const map = {};
    for (const opt of candidateOptions) map[opt.value] = opt;
    return map;
  }, [candidateOptions]);

  const isInherit = mode === 'inherit';
  const atLimit = value.length >= maxCount;

  const candidates = useMemo(
    () => candidateOptions.filter((opt) => !value.includes(opt.value)),
    [candidateOptions, value],
  );

  const emit = (groups, nextMode) => onChange?.({ groups, mode: nextMode });
  const addGroup = (group) => {
    if (!group || atLimit || value.includes(group)) return;
    emit([...value, group], 'custom');
  };
  const removeGroup = (group) =>
    emit(
      value.filter((g) => g !== group),
      'custom',
    );
  const move = (index, dir) => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    emit(next, 'custom');
  };

  const labelOf = (name) => optionByValue[name]?.label || name;
  const ratioOf = (name) => optionByValue[name]?.ratio;

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <Text type='tertiary' size='small'>
          {isInherit
            ? t('继承全局 Auto 顺序（共 {{count}} 个分组）', {
                count: globalOrder.length,
              })
            : t('已选 {{count}} / {{max}} 个分组', {
                count: value.length,
                max: maxCount,
              })}
        </Text>
        <Button
          size='small'
          theme='borderless'
          icon={<IconRefresh />}
          disabled={isInherit}
          onClick={() => emit([], 'inherit')}
        >
          {t('恢复全局 Auto')}
        </Button>
      </div>

      <Select
        size='small'
        filter
        value={null}
        placeholder={
          atLimit
            ? t('最多可选 {{max}} 个分组', { max: maxCount })
            : t('添加 Auto 分组')
        }
        optionList={candidates.map((opt) => ({
          value: opt.value,
          label: opt.label || opt.value,
        }))}
        onChange={addGroup}
        disabled={atLimit || candidates.length === 0}
        style={{ width: '100%' }}
        position='bottomLeft'
      />

      {isInherit ? (
        globalOrder.length === 0 ? (
          <Text type='tertiary' size='small' className='block text-center py-2'>
            {t('全局 Auto 顺序中暂无可用分组')}
          </Text>
        ) : (
          <div className='flex flex-wrap items-center gap-1'>
            {globalOrder.map((name, index) => (
              <React.Fragment key={name}>
                {index > 0 && (
                  <Text type='tertiary' size='small'>
                    →
                  </Text>
                )}
                <Tag size='small' color='white' shape='circle'>
                  {index + 1}. {labelOf(name)}
                </Tag>
              </React.Fragment>
            ))}
          </div>
        )
      ) : value.length === 0 ? (
        <Text type='tertiary' size='small' className='block text-center py-2'>
          {t('当前无有效的自定义 Auto 分组，请添加分组或恢复全局 Auto')}
        </Text>
      ) : (
        <div className='flex flex-col gap-2'>
          {value.map((name, index) => (
            <div key={name} className='flex items-center gap-2'>
              <Tag
                size='small'
                color='blue'
                shape='circle'
                className='shrink-0'
              >
                {index + 1}
              </Tag>
              <span className='flex-1 truncate text-sm'>{labelOf(name)}</span>
              {ratioOf(name) !== undefined && (
                <Tag size='small' color='green' shape='circle'>
                  {ratioOf(name)}x
                </Tag>
              )}
              <Button
                icon={<IconChevronUp />}
                theme='borderless'
                size='small'
                disabled={index === 0}
                onClick={() => move(index, 'up')}
                aria-label={t('上移')}
              />
              <Button
                icon={<IconChevronDown />}
                theme='borderless'
                size='small'
                disabled={index === value.length - 1}
                onClick={() => move(index, 'down')}
                aria-label={t('下移')}
              />
              <Button
                icon={<IconClose />}
                type='danger'
                theme='borderless'
                size='small'
                onClick={() => removeGroup(name)}
                aria-label={t('移除')}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TokenAutoGroupEditor;
