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

import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '@douyinfe/semi-ui';
import { ArrowUpCircle, RefreshCw } from 'lucide-react';

import { UserContext } from '../../../context/User';
import { useSystemUpdate } from '../../../hooks/common/useSystemUpdate';
import SystemUpdateDialog from '../../common/SystemUpdateDialog';

/**
 * 顶栏的系统更新入口（对齐新版 app-header 里的 SystemUpdateAction）。
 *
 * 权限口径：**只有管理员可见**（role >= 10，与上游 ROLE.ADMIN 一致）。
 * 上游这条链路的检查请求由浏览器直连 GitHub API，普通用户和访客根本不该
 * 替本站去消耗那个 60 次/小时的匿名额度，所以这里连组件都不渲染。
 *
 * 红点用 Badge 的 dot 形态而不是数字：一个站点最多只有「有 / 没有新版本」。
 */
const UpdateButton = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const isAdmin = Boolean(userState?.user && (userState.user.role ?? 0) >= 10);
  if (!isAdmin) return null;
  return <UpdateButtonInner t={t} />;
};

// 拆成两层是刻意的：非管理员连 hook 都不该挂载，
// 否则会白挂一组 visibility/focus 监听器（上游 system-update-action.tsx 同构）。
const UpdateButtonInner = ({ t }) => {
  const update = useSystemUpdate();
  const [visible, setVisible] = useState(false);

  const description = update.shouldNotify
    ? t('发现新版本：{{version}}', { version: update.release?.tag_name })
    : update.snapshot?.error
      ? t('检查更新失败')
      : t('检查更新');

  const button = (
    <Button
      icon={
        update.shouldNotify ? (
          <ArrowUpCircle size={18} />
        ) : (
          <RefreshCw
            size={18}
            className={update.checking ? 'animate-spin' : ''}
          />
        )
      }
      aria-label={description}
      title={description}
      onClick={() => setVisible(true)}
      theme='borderless'
      type='tertiary'
      className={
        update.shouldNotify
          ? '!p-1.5 !rounded-full focus:!bg-semi-color-fill-1 dark:focus:!bg-gray-700 hover:!bg-semi-color-fill-1 dark:hover:!bg-semi-color-fill-2 !text-semi-color-primary'
          : '!p-1.5 !text-current focus:!bg-semi-color-fill-1 dark:focus:!bg-gray-700 !rounded-full !bg-semi-color-fill-0 dark:!bg-semi-color-fill-1 hover:!bg-semi-color-fill-1 dark:hover:!bg-semi-color-fill-2'
      }
    />
  );

  return (
    <>
      {update.shouldNotify ? (
        <Badge type='danger' dot>
          {button}
        </Badge>
      ) : (
        button
      )}
      <SystemUpdateDialog
        visible={visible}
        onCancel={() => setVisible(false)}
        update={update}
      />
    </>
  );
};

export default UpdateButton;
