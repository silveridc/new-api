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
import { API, showError, showSuccess, requestVerification } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';
import {
  adminDeleteVerification,
  adminManageVerification,
  adminPasskeyResetVerification,
  adminTwoFADisableVerification,
  resolveProofToken,
  securityProofConfig,
} from '../../components/table/users/userSecurity';

export const useUsersData = () => {
  const { t } = useTranslation();
  const [compactMode, setCompactMode] = useTableCompactMode('users');

  // State management
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [userCount, setUserCount] = useState(0);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState({
    id: undefined,
  });

  // Form initial values
  const formInitValues = {
    searchKeyword: '',
    searchGroup: '',
  };

  // Form API reference
  const [formApi, setFormApi] = useState(null);

  // Get form values helper function
  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
      searchGroup: formValues.searchGroup || '',
    };
  };

  // Set user format with key field
  const setUserFormat = (users) => {
    for (let i = 0; i < users.length; i++) {
      users[i].key = users[i].id;
    }
    setUsers(users);
  };

  // Load users data
  const loadUsers = async (startIdx, pageSize) => {
    setLoading(true);
    const res = await API.get(`/api/user/?p=${startIdx}&page_size=${pageSize}`);
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Search users with keyword and group
  const searchUsers = async (
    startIdx,
    pageSize,
    searchKeyword = null,
    searchGroup = null,
  ) => {
    // If no parameters passed, get values from form
    if (searchKeyword === null || searchGroup === null) {
      const formValues = getFormValues();
      searchKeyword = formValues.searchKeyword;
      searchGroup = formValues.searchGroup;
    }

    if (searchKeyword === '' && searchGroup === '') {
      // If keyword is blank, load files instead
      await loadUsers(startIdx, pageSize);
      return;
    }
    setSearching(true);
    const res = await API.get(
      `/api/user/search?keyword=${searchKeyword}&group=${searchGroup}&p=${startIdx}&page_size=${pageSize}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  // Manage user operations (promote, demote, enable, disable, delete).
  // 敏感操作先走二次验证拿一次性 proof；用户取消则安静返回，不发请求也不报错。
  const manageUser = async (userId, action, record) => {
    setLoading(true);
    try {
      const verification =
        action === 'delete'
          ? adminDeleteVerification(userId)
          : adminManageVerification(userId, action);
      const proof = await requestVerification({
        ...verification,
        title: action === 'delete' ? t('注销用户') : t('用户管理操作'),
        description: record?.username
          ? t('目标用户：{{username}}', { username: record.username })
          : undefined,
      });
      if (!resolveProofToken(proof)) {
        return false;
      }

      const res = await API.post(
        '/api/user/manage',
        { id: userId, action },
        securityProofConfig(proof),
      );

      const { success, message } = res.data;
      if (success) {
        showSuccess(t('操作成功完成！'));
        const user = res.data.data;

        // Create a new array and new object to ensure React detects changes
        const newUsers = users.map((u) => {
          if (u.id === userId) {
            if (action === 'delete') {
              return { ...u, DeletedAt: new Date() };
            }
            return { ...u, status: user.status, role: user.role };
          }
          return u;
        });

        setUsers(newUsers);
        return true;
      }
      showError(message);
      return false;
    } catch (error) {
      showError(error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const resetUserPasskey = async (user) => {
    if (!user) {
      return false;
    }
    try {
      const proof = await requestVerification({
        ...adminPasskeyResetVerification(user.id),
        title: t('重置 Passkey'),
        description: user.username
          ? t('目标用户：{{username}}', { username: user.username })
          : undefined,
      });
      if (!resolveProofToken(proof)) {
        return false;
      }
      const res = await API.delete(
        `/api/user/${user.id}/reset_passkey`,
        securityProofConfig(proof),
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('Passkey 已重置'));
        return true;
      }
      showError(message || t('操作失败，请重试'));
      return false;
    } catch (error) {
      showError(t('操作失败，请重试'));
      return false;
    }
  };

  const resetUserTwoFA = async (user) => {
    if (!user) {
      return false;
    }
    try {
      const proof = await requestVerification({
        ...adminTwoFADisableVerification(user.id),
        title: t('重置两步验证'),
        description: user.username
          ? t('目标用户：{{username}}', { username: user.username })
          : undefined,
      });
      if (!resolveProofToken(proof)) {
        return false;
      }
      const res = await API.delete(
        `/api/user/${user.id}/2fa`,
        securityProofConfig(proof),
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('二步验证已重置'));
        return true;
      }
      showError(message || t('操作失败，请重试'));
      return false;
    } catch (error) {
      showError(t('操作失败，请重试'));
      return false;
    }
  };

  // Handle page change
  const handlePageChange = (page) => {
    setActivePage(page);
    const { searchKeyword, searchGroup } = getFormValues();
    if (searchKeyword === '' && searchGroup === '') {
      loadUsers(page, pageSize).then();
    } else {
      searchUsers(page, pageSize, searchKeyword, searchGroup).then();
    }
  };

  // Handle page size change
  const handlePageSizeChange = async (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadUsers(activePage, size)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  };

  // Handle table row styling for disabled/deleted users
  const handleRow = (record, index) => {
    if (record.DeletedAt !== null || record.status !== 1) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    } else {
      return {};
    }
  };

  // Refresh data
  const refresh = async (page = activePage) => {
    const { searchKeyword, searchGroup } = getFormValues();
    if (searchKeyword === '' && searchGroup === '') {
      await loadUsers(page, pageSize);
    } else {
      await searchUsers(page, pageSize, searchKeyword, searchGroup);
    }
  };

  // Fetch groups data
  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      if (res === undefined) {
        return;
      }
      setGroupOptions(
        res.data.data.map((group) => ({
          label: group,
          value: group,
        })),
      );
    } catch (error) {
      showError(error.message);
    }
  };

  // Modal control functions
  const closeAddUser = () => {
    setShowAddUser(false);
  };

  const closeEditUser = () => {
    setShowEditUser(false);
    setEditingUser({
      id: undefined,
    });
  };

  // Initialize data on component mount
  useEffect(() => {
    loadUsers(0, pageSize)
      .then()
      .catch((reason) => {
        showError(reason);
      });
    fetchGroups().then();
  }, []);

  return {
    // Data state
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    searching,
    groupOptions,

    // Modal state
    showAddUser,
    showEditUser,
    editingUser,
    setShowAddUser,
    setShowEditUser,
    setEditingUser,

    // Form state
    formInitValues,
    formApi,
    setFormApi,

    // UI state
    compactMode,
    setCompactMode,

    // Actions
    loadUsers,
    searchUsers,
    manageUser,
    resetUserPasskey,
    resetUserTwoFA,
    handlePageChange,
    handlePageSizeChange,
    handleRow,
    refresh,
    closeAddUser,
    closeEditUser,
    getFormValues,

    // Translation
    t,
  };
};
