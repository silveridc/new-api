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
  Pagination,
  Select,
  SideSheet,
  Space,
  Input,
  Typography,
  Tag,
  Avatar,
  Empty,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconBranch, IconDelete, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
  getLobeHubIcon,
  showError,
  timestamp2string,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import CardTable from '../../../common/ui/CardTable';
import { renderDescription } from '../../../common/ui/RenderUtils';
import EditVendorModal from './EditVendorModal';
import VendorOperationModal from './VendorOperationModal';
import {
  VENDOR_ACTION,
  getVendorErrorText,
  searchVendors,
} from '../../../../services/vendors';

const { Title, Text } = Typography;

const ASSOCIATION_OPTIONS = [
  { label: '全部', value: '' },
  { label: '已关联模型', value: 'linked' },
  { label: '未关联模型', value: 'unlinked' },
];

/**
 * 供应商管理抽屉：搜索（关键字 / 是否关联模型 / 分页）与批量操作入口。
 * 批量操作一律先预览再执行，见 VendorOperationModal 的 expected_version 契约。
 */
const VendorManagementModal = ({
  visible,
  onClose,
  vendors,
  onDataChanged,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [association, setAssociation] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [operation, setOperation] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editingVendor, setEditingVendor] = useState({ id: undefined });

  const fetchVendors = useCallback(
    async (query = {}) => {
      const nextPage = query.page ?? 1;
      const nextSize = query.pageSize ?? pageSize;
      setLoading(true);
      try {
        const data = await searchVendors({
          keyword: (query.keyword ?? keyword).trim(),
          association: query.association ?? association,
          page: nextPage,
          pageSize: nextSize,
        });
        setItems(data.items);
        setTotal(data.total);
        setPage(nextPage);
        setPageSize(nextSize);
      } catch (error) {
        setItems([]);
        setTotal(0);
        showError(getVendorErrorText(error, t));
      }
      setLoading(false);
    },
    [association, keyword, pageSize, t],
  );

  useEffect(() => {
    if (!visible) return;
    setKeyword('');
    setAssociation('');
    setSelectedRowKeys([]);
    fetchVendors({ page: 1, keyword: '', association: '' });
    // 仅在打开时重置筛选条件并加载第一页
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const reloadAfterChange = () => {
    fetchVendors({ page });
    onDataChanged?.();
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setShowEdit(true);
  };

  const columns = [
    {
      title: t('供应商'),
      dataIndex: 'name',
      render: (text, record) => (
        <Space>
          <Avatar size='small' shape='circle' color='grey'>
            {getLobeHubIcon(record.icon || 'Layers', 16)}
          </Avatar>
          <Button
            theme='borderless'
            type='primary'
            size='small'
            className='p-0 h-auto'
            onClick={() => handleEdit(record)}
          >
            {text}
          </Button>
        </Space>
      ),
    },
    {
      title: t('描述'),
      dataIndex: 'description',
      render: (text) => renderDescription(text, 160),
    },
    {
      title: t('关联模型数'),
      dataIndex: 'model_count',
      width: 110,
      render: (text) => text || 0,
    },
    { title: t('ID'), dataIndex: 'id', width: 80 },
    {
      title: t('更新时间'),
      dataIndex: 'updated_time',
      width: 160,
      render: (text) => timestamp2string(text),
    },
    {
      title: t('操作'),
      dataIndex: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size='small' onClick={() => handleEdit(record)}>
            {t('编辑')}
          </Button>
          <Button
            size='small'
            type='danger'
            theme='light'
            onClick={() =>
              setOperation({
                action: VENDOR_ACTION.delete,
                vendor_ids: [record.id],
              })
            }
          >
            {t('删除')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <SideSheet
        placement='left'
        title={
          <Space>
            <Tag color='blue' shape='circle'>
              {t('管理')}
            </Tag>
            <Title heading={4} className='m-0'>
              {t('供应商管理')}
            </Title>
          </Space>
        }
        visible={visible}
        onCancel={onClose}
        width={isMobile ? '100%' : 900}
        bodyStyle={{ padding: '0' }}
        closeIcon={null}
      >
        <div className='p-2'>
          <Card className='!rounded-2xl shadow-sm border-0'>
            <div className='flex flex-wrap items-center gap-2 mb-3'>
              <Input
                prefix={<IconSearch />}
                placeholder={t('搜索供应商名称或描述')}
                value={keyword}
                onChange={setKeyword}
                onEnterPress={() => fetchVendors({ page: 1 })}
                style={{ width: isMobile ? '100%' : 260 }}
              />
              <Select
                value={association}
                onChange={(value) => {
                  setAssociation(value);
                  fetchVendors({ page: 1, association: value });
                }}
                optionList={ASSOCIATION_OPTIONS.map((option) => ({
                  label: t(option.label),
                  value: option.value,
                }))}
                style={{ width: 140 }}
              />
              <Button
                type='primary'
                theme='solid'
                size='small'
                onClick={() => fetchVendors({ page: 1 })}
              >
                {t('查询')}
              </Button>
              <Button
                size='small'
                onClick={() => {
                  setKeyword('');
                  setAssociation('');
                  fetchVendors({ page: 1, keyword: '', association: '' });
                }}
              >
                {t('重置')}
              </Button>
            </div>

            {selectedRowKeys.length > 0 && (
              <div className='flex flex-wrap items-center gap-2 mb-3'>
                <Text type='tertiary'>
                  {t('已选择 {{count}} 个供应商', {
                    count: selectedRowKeys.length,
                  })}
                </Text>
                <Button
                  size='small'
                  type='tertiary'
                  theme='solid'
                  icon={<IconBranch />}
                  onClick={() =>
                    setOperation({
                      action: VENDOR_ACTION.merge,
                      vendor_ids: selectedRowKeys,
                    })
                  }
                >
                  {t('合并所选')}
                </Button>
                <Button
                  size='small'
                  type='danger'
                  theme='solid'
                  icon={<IconDelete />}
                  onClick={() =>
                    setOperation({
                      action: VENDOR_ACTION.delete,
                      vendor_ids: selectedRowKeys,
                    })
                  }
                >
                  {t('删除所选')}
                </Button>
                <Button size='small' onClick={() => setSelectedRowKeys([])}>
                  {t('取消选择')}
                </Button>
              </div>
            )}

            {items.length > 0 ? (
              <>
                <CardTable
                  columns={columns}
                  dataSource={items}
                  loading={loading}
                  rowKey='id'
                  size='small'
                  hidePagination={true}
                  scroll={{ x: 'max-content' }}
                  rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                  }}
                />
                <div className='flex justify-end mt-3'>
                  <Pagination
                    total={total}
                    currentPage={page}
                    pageSize={pageSize}
                    showSizeChanger
                    pageSizeOptions={[10, 20, 50, 100]}
                    onPageSizeChange={(size) =>
                      fetchVendors({ page: 1, pageSize: size })
                    }
                    onPageChange={(next) => fetchVendors({ page: next })}
                  />
                </div>
              </>
            ) : (
              <Empty
                image={
                  <IllustrationNoResult style={{ width: 150, height: 150 }} />
                }
                darkModeImage={
                  <IllustrationNoResultDark
                    style={{ width: 150, height: 150 }}
                  />
                }
                description={t('暂无供应商')}
                style={{ padding: 30 }}
              />
            )}
          </Card>
        </div>
      </SideSheet>

      <EditVendorModal
        visible={showEdit}
        editingVendor={editingVendor}
        handleClose={() => {
          setShowEdit(false);
          setEditingVendor({ id: undefined });
        }}
        refresh={reloadAfterChange}
      />

      <VendorOperationModal
        visible={Boolean(operation)}
        operation={operation}
        vendors={vendors}
        onClose={() => setOperation(null)}
        onSuccess={reloadAfterChange}
      />
    </>
  );
};

export default VendorManagementModal;
