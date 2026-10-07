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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import { isRoot, showError, showSuccess, timestamp2string } from '../../helpers';
import Forbidden from '../Forbidden';
import {
  SYSTEM_TASK_STATUS_OPTIONS,
  SYSTEM_TASK_SCOPE,
  deleteStaleSystemInstance,
  deleteStaleSystemInstances,
  deleteSystemTaskHistory,
  listSystemInstances,
  listSystemTasks,
  buildInstanceRows,
  buildSystemTaskRows,
  systemTaskTypeLabel,
} from '../../services/systemInfo';

const { Text, Title } = Typography;

function formatUnixSeconds(ts) {
  if (!ts) return '-';
  try {
    return timestamp2string(ts);
  } catch (e) {
    return '-';
  }
}

function statusTag(status, t) {
  const map = {
    online: { color: 'green', label: t('在线') },
    stale: { color: 'orange', label: t('失联') },
    pending: { color: 'amber', label: t('等待中') },
    running: { color: 'blue', label: t('运行中') },
    succeeded: { color: 'green', label: t('已成功') },
    failed: { color: 'red', label: t('已失败') },
  };
  const item = map[status] || { color: 'grey', label: status };
  return <Tag color={item.color}>{item.label}</Tag>;
}

function InstancesPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState([]);

  const loadInstances = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSystemInstances();
      setInstances(data);
    } catch (error) {
      showError(error.message || t('获取系统实例失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  const confirmDeleteStale = () => {
    Modal.confirm({
      title: t('清理失联实例'),
      content: <Text>{t('将删除所有已超过失联判定时间的实例记录。')}</Text>,
      onOk: async () => {
        try {
          const deleted = await deleteStaleSystemInstances();
          showSuccess(t('已删除 {{count}} 条实例记录', { count: deleted }));
          await loadInstances();
        } catch (error) {
          showError(error.message || t('清理失联实例失败'));
        }
      },
    });
  };

  const confirmDeleteOne = (row) => {
    Modal.confirm({
      title: t('删除实例'),
      content: (
        <Text>
          {t('实例')}：<Text strong>{row.display_name}</Text>
        </Text>
      ),
      onOk: async () => {
        try {
          await deleteStaleSystemInstance(row.node_name);
          showSuccess(t('已删除'));
          await loadInstances();
        } catch (error) {
          showError(error.message || t('删除实例失败'));
        }
      },
    });
  };

  const columns = [
    {
      title: t('节点'),
      dataIndex: 'display_name',
      render: (text, record) => (
        <div>
          <Text strong>{text}</Text>
          {record.role === 'master' ? (
            <Tag color='violet' style={{ marginLeft: 6 }}>
              {t('主节点')}
            </Tag>
          ) : (
            <Tag color='grey' style={{ marginLeft: 6 }}>
              {t('工作节点')}
            </Tag>
          )}
        </div>
      ),
    },
    { title: t('版本'), dataIndex: 'version' },
    { title: t('平台'), dataIndex: 'platform' },
    { title: t('主机名'), dataIndex: 'hostname' },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (value) => statusTag(value, t),
    },
    {
      title: t('CPU'),
      dataIndex: 'cpu_percent',
      render: (value) =>
        value === null ? '-' : `${Number(value).toFixed(1)}%`,
    },
    {
      title: t('内存'),
      dataIndex: 'memory_percent',
      render: (value) =>
        value === null ? '-' : `${Number(value).toFixed(1)}%`,
    },
    {
      title: t('启动时间'),
      dataIndex: 'started_at',
      render: (ts) => (
        <Text type='tertiary' size='small'>
          {formatUnixSeconds(ts)}
        </Text>
      ),
    },
    {
      title: t('最后心跳'),
      dataIndex: 'last_seen_at',
      render: (ts) => (
        <Text type='tertiary' size='small'>
          {formatUnixSeconds(ts)}
        </Text>
      ),
    },
    {
      title: t('操作'),
      width: 80,
      render: (_, record) => (
        <Button
          icon={<IconDelete />}
          theme='borderless'
          type='danger'
          disabled={record.status !== 'stale'}
          title={t('删除该失联实例')}
          aria-label={t('删除该失联实例')}
          onClick={() => confirmDeleteOne(record)}
        />
      ),
    },
  ];

  return (
    <Card
      title={t('系统实例')}
      headerExtraContent={
        <Space>
          <Button size='small' type='danger' onClick={confirmDeleteStale}>
            {t('清理失联实例')}
          </Button>
          <Button
            size='small'
            icon={<IconRefresh />}
            loading={loading}
            onClick={loadInstances}
          >
            {t('刷新')}
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={buildInstanceRows(instances)}
        rowKey='key'
        loading={loading}
        pagination={false}
        size='small'
        empty={<Empty description={t('暂无实例上报记录')} />}
      />
    </Card>
  );
}

function TasksPanel() {
  const { t } = useTranslation();
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeTasks, setActiveTasks] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTasks, setHistoryTasks] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [filters, setFilters] = useState({ type: '', status: '' });
  const pageSize = 10;

  const loadActive = useCallback(async () => {
    setActiveLoading(true);
    try {
      const { tasks } = await listSystemTasks(100, {
        scope: SYSTEM_TASK_SCOPE.ACTIVE,
      });
      setActiveTasks(tasks);
    } catch (error) {
      showError(error.message || t('获取系统任务失败'));
    } finally {
      setActiveLoading(false);
    }
  }, []);

  const loadHistory = useCallback(
    async (page, nextFilters) => {
      setHistoryLoading(true);
      try {
        const offset = ((page || 1) - 1) * pageSize;
        const { tasks, total } = await listSystemTasks(pageSize, {
          scope: SYSTEM_TASK_SCOPE.HISTORY,
          type: nextFilters?.type || '',
          status: nextFilters?.status || '',
          offset,
        });
        setHistoryTasks(tasks);
        setHistoryTotal(total);
      } catch (error) {
        showError(error.message || t('获取任务历史失败'));
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadActive();
    const timer = setInterval(() => {
      loadActive();
    }, 8000);
    return () => clearInterval(timer);
  }, [loadActive]);

  useEffect(() => {
    loadHistory(1, filters);
    setHistoryPage(1);
  }, [filters, loadHistory]);

  const confirmDeleteHistory = () => {
    Modal.confirm({
      title: t('清理任务历史'),
      content: (
        <Text>
          {t(
            '将按当前筛选条件（类型/状态）删除全部历史任务记录，该操作不可恢复。',
          )}
        </Text>
      ),
      onOk: async () => {
        try {
          const deleted = await deleteSystemTaskHistory({
            type: filters.type || '',
            status: filters.status || '',
          });
          showSuccess(t('已删除 {{count}} 条任务记录', { count: deleted }));
          await loadHistory(1, filters);
          await loadActive();
        } catch (error) {
          showError(error.message || t('清理任务历史失败'));
        }
      },
    });
  };

  const taskColumns = [
    {
      title: t('类型'),
      dataIndex: 'type_label',
      render: (text, record) => (
        <div>
          <Text strong>{text}</Text>
          <div>
            <Text type='tertiary' size='small' copyable={{ content: record.task_id }}>
              {record.task_id}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      width: 100,
      render: (value) => statusTag(value, t),
    },
    {
      title: t('进度'),
      dataIndex: 'progress',
      width: 140,
      render: (progress) =>
        progress === null ? '-' : `${Math.round(progress)}%`,
    },
    { title: t('执行者'), dataIndex: 'locked_by' },
    {
      title: t('结果 / 错误'),
      dataIndex: 'error',
      render: (error, record) => {
        if (error) {
          return (
            <Text type='danger' size='small' ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }}>
              {error}
            </Text>
          );
        }
        if (record.result && typeof record.result === 'object') {
          return (
            <Text type='tertiary' size='small' ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }}>
              {JSON.stringify(record.result)}
            </Text>
          );
        }
        return <Text type='tertiary'>-</Text>;
      },
    },
    {
      title: t('更新时间'),
      dataIndex: 'updated_at',
      render: (ts) => (
        <Text type='tertiary' size='small'>
          {formatUnixSeconds(ts)}
        </Text>
      ),
    },
  ];

  const historyTypeOptions = useMemo(() => {
    const types = new Set(historyTasks.map((task) => task.type).filter(Boolean));
    return [
      ...Array.from(types).map((type) => ({
        value: type,
        label: systemTaskTypeLabel(type),
      })),
    ];
  }, [historyTasks]);

  return (
    <>
      <Card
        title={t('后台系统任务')}
        style={{ marginTop: 12 }}
        headerExtraContent={
          <Button
            size='small'
            icon={<IconRefresh />}
            loading={activeLoading}
            onClick={loadActive}
          >
            {t('刷新')}
          </Button>
        }
      >
        <Table
          columns={taskColumns}
          dataSource={buildSystemTaskRows(activeTasks)}
          rowKey='key'
          loading={activeLoading}
          pagination={false}
          size='small'
          empty={<Empty description={t('当前没有等待或运行中的系统任务')} />}
        />
      </Card>

      <Card
        title={t('任务历史')}
        style={{ marginTop: 12 }}
        headerExtraContent={
          <Space>
            <Select
              placeholder={t('类型')}
              value={filters.type || undefined}
              optionList={historyTypeOptions}
              style={{ width: 160 }}
              showClear
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, type: value || '' }))
              }
              aria-label={t('任务类型筛选')}
            />
            <Select
              placeholder={t('状态')}
              value={filters.status || undefined}
              optionList={SYSTEM_TASK_STATUS_OPTIONS}
              style={{ width: 140 }}
              showClear
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, status: value || '' }))
              }
              aria-label={t('任务状态筛选')}
            />
            <Button size='small' type='danger' onClick={confirmDeleteHistory}>
              {t('清理历史')}
            </Button>
          </Space>
        }
      >
        <Table
          columns={taskColumns}
          dataSource={buildSystemTaskRows(historyTasks)}
          rowKey='key'
          loading={historyLoading}
          size='small'
          pagination={{
            currentPage: historyPage,
            pageSize,
            total: historyTotal,
            onPageChange: (page) => {
              setHistoryPage(page);
              loadHistory(page, filters);
            },
          }}
          empty={<Empty description={t('暂无历史任务')} />}
        />
      </Card>
    </>
  );
}

export default function SystemInfo() {
  const { t } = useTranslation();
  // /api/system-info 与 /api/system-task 均为 RootAuth；非 root 直接显示 403。
  if (!isRoot()) {
    return <Forbidden />;
  }
  return (
    <div className='mt-[60px] px-2 pb-6'>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24}>
          <Title heading={4}>
            {t('系统信息')}
            <Tag color='red' style={{ marginLeft: 8 }}>
              Root
            </Tag>
          </Title>
          <Text type='tertiary' size='small'>
            {t('查看多实例部署状态与跨实例执行的后台系统任务。')}
          </Text>
        </Col>
      </Row>
      <InstancesPanel />
      <TasksPanel />
    </div>
  );
}
