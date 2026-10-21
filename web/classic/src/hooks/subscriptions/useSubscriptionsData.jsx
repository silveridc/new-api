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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { useTableCompactMode } from '../common/useTableCompactMode';

export const useSubscriptionsData = () => {
  const { t } = useTranslation();
  const [compactMode, setCompactMode] = useTableCompactMode('subscriptions');

  // State management
  const [allPlans, setAllPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination (client-side for now)
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Drawer states
  const [showEdit, setShowEdit] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [sheetPlacement, setSheetPlacement] = useState('left'); // 'left' | 'right'

  // Load subscription plans
  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        const next = res.data.data || [];
        setAllPlans(next);

        // Keep page in range after data changes
        const totalPages = Math.max(1, Math.ceil(next.length / pageSize));
        setActivePage((p) => Math.min(p || 1, totalPages));
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  // Refresh data
  const refresh = async () => {
    await loadPlans();
  };

  const handlePageChange = (page) => {
    setActivePage(page);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
  };

  // Update plan enabled status (single endpoint)
  const setPlanEnabled = async (planRecordOrId, enabled) => {
    const planId =
      typeof planRecordOrId === 'number'
        ? planRecordOrId
        : planRecordOrId?.plan?.id;
    if (!planId) return;
    setLoading(true);
    try {
      const res = await API.patch(`/api/subscription/admin/plans/${planId}`, {
        enabled: !!enabled,
      });
      if (res.data?.success) {
        showSuccess(enabled ? t('已启用') : t('已禁用'));
        await loadPlans();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  // 批量重置套餐下所有生效中订阅的已用额度。
  // 契约：POST /api/subscription/admin/plans/:id/subscriptions/reset（controller/subscription.go:487-515），
  // body 里的 plan_id 服务端忽略，只认 URL 上的 :id；advance_reset_time 缺省时后端按 true 处理。
  const resetPlanQuota = async (planRecordOrId, advanceResetTime = true) => {
    const planId =
      typeof planRecordOrId === 'number'
        ? planRecordOrId
        : planRecordOrId?.plan?.id;
    if (!planId) return false;
    setLoading(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/plans/${planId}/subscriptions/reset`,
        { advance_reset_time: !!advanceResetTime },
      );
      if (res.data?.success) {
        showSuccess(
          t('已重置 {{num}} 个生效中的订阅', {
            num: Number(res.data?.data?.reset_count || 0),
          }),
        );
        await loadPlans();
        return true;
      }
      showError(res.data?.message || t('操作失败'));
      return false;
    } catch (e) {
      showError(t('请求失败'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Modal control functions
  const closeEdit = () => {
    setShowEdit(false);
    setEditingPlan(null);
  };

  const openCreate = () => {
    setSheetPlacement('left');
    setEditingPlan(null);
    setShowEdit(true);
  };

  const openEdit = (planRecord) => {
    setSheetPlacement('right');
    setEditingPlan(planRecord);
    setShowEdit(true);
  };

  // Initialize data on component mount
  useEffect(() => {
    loadPlans();
  }, []);

  const planCount = allPlans.length;
  const plans = allPlans.slice(
    Math.max(0, (activePage - 1) * pageSize),
    Math.max(0, (activePage - 1) * pageSize) + pageSize,
  );

  return {
    // Data state
    plans,
    planCount,
    loading,

    // Modal state
    showEdit,
    editingPlan,
    sheetPlacement,
    setShowEdit,
    setEditingPlan,

    // UI state
    compactMode,
    setCompactMode,

    // Pagination
    activePage,
    pageSize,
    handlePageChange,
    handlePageSizeChange,

    // Actions
    loadPlans,
    setPlanEnabled,
    resetPlanQuota,
    refresh,
    closeEdit,
    openCreate,
    openEdit,

    // Translation
    t,
  };
};
