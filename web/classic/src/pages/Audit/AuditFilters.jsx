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
import { Button, Form } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';

import { DATE_RANGE_PRESETS } from '../../constants/console.constants';
import { AUDIT_CATEGORIES } from '../../services/auditLogs';

const AuditFilters = (props) => (
  <Form
    initValues={props.formInitValues}
    getFormApi={props.setFormApi}
    onSubmit={props.onSubmit}
    allowEmpty
    autoComplete='off'
    layout='vertical'
    trigger='change'
    stopValidateWithError={false}
  >
    <div className='flex flex-col gap-2'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
        <div className='col-span-1 lg:col-span-2'>
          <Form.DatePicker
            field='dateRange'
            className='w-full'
            type='dateTimeRange'
            placeholder={[props.t('开始时间'), props.t('结束时间')]}
            showClear
            pure
            size='small'
            presets={DATE_RANGE_PRESETS.map((preset) => ({
              text: props.t(preset.text),
              start: preset.start(),
              end: preset.end(),
            }))}
          />
        </div>

        {props.canReadAll && (
          <Form.Input
            field='username'
            prefix={<IconSearch />}
            placeholder={props.t('用户名')}
            showClear
            pure
            size='small'
          />
        )}

        <Form.Input
          field='token_ref'
          prefix={<IconSearch />}
          placeholder={props.t('令牌标识')}
          showClear
          pure
          size='small'
        />
        <Form.Input
          field='request_id'
          prefix={<IconSearch />}
          placeholder={props.t('请求 ID')}
          showClear
          pure
          size='small'
        />
        <Form.Select
          field='category'
          placeholder={props.t('分类')}
          showClear
          pure
          size='small'
        >
          <Form.Select.Option value='all'>
            {props.t('全部分类')}
          </Form.Select.Option>
          {AUDIT_CATEGORIES.map((category) => (
            <Form.Select.Option key={category.value} value={category.value}>
              {props.t(category.label)}
            </Form.Select.Option>
          ))}
        </Form.Select>
        <Form.Select
          field='success'
          placeholder={props.t('结果')}
          showClear
          pure
          size='small'
        >
          <Form.Select.Option value='all'>
            {props.t('全部结果')}
          </Form.Select.Option>
          <Form.Select.Option value='true'>
            {props.t('成功')}
          </Form.Select.Option>
          <Form.Select.Option value='false'>
            {props.t('失败')}
          </Form.Select.Option>
        </Form.Select>
      </div>

      <div className='flex justify-end gap-2'>
        <Button
          type='tertiary'
          htmlType='submit'
          loading={props.loading}
          size='small'
        >
          {props.t('查询')}
        </Button>
        <Button type='tertiary' onClick={props.onReset} size='small'>
          {props.t('重置')}
        </Button>
        <Button
          type='tertiary'
          onClick={props.onOpenColumnSelector}
          size='small'
        >
          {props.t('列设置')}
        </Button>
      </div>
    </div>
  </Form>
);

export default AuditFilters;
