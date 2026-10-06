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
*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Layout,
  Modal,
  Spin,
  Switch,
  Tabs,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import { CircleHelp, Upload } from 'lucide-react';

import {
  getTaskPluginEnabledOption,
  listTaskPlugins,
  setTaskPluginEnabledOption,
} from '../../services/taskPlugins';
import CardPro from '../../components/common/ui/CardPro';
import PluginsTable from './PluginsTable';
import UploadPluginModal from './UploadPluginModal';
import MarketplacePanel from './MarketplacePanel';
import {
  DryRunModal,
  PluginDetailModal,
  PluginVersionsModal,
} from './PluginDetailModals';

/**
 * 任务插件管理页。移植自新版 web/src/features/task-plugins/。
 * 端点：/api/plugin/task 系列（RootAuth）+ /api/option/ 的
 * TaskPluginEnabled 总开关 + /api/task_plugin_options（渠道绑定选项，见服务层）。
 */
const TaskPluginsPanel = () => {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [enabledLoading, setEnabledLoading] = useState(true);
  const [mutatingEnabled, setMutatingEnabled] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [tab, setTab] = useState('installed');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKey, setUploadKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [versionsTarget, setVersionsTarget] = useState(null);
  const [dryRunTarget, setDryRunTarget] = useState(null);
  const [error, setError] = useState('');

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try {
      setPlugins(await listTaskPlugins());
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEnabled = useCallback(async () => {
    setEnabledLoading(true);
    try {
      setEnabled(await getTaskPluginEnabledOption());
    } catch {
      setEnabled(false);
    } finally {
      setEnabledLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
    loadEnabled();
  }, [loadPlugins, loadEnabled]);

  const overridePlugins = useMemo(
    () => plugins.filter((plugin) => plugin.source === 'override'),
    [plugins],
  );

  const handleEnabledChange = async (checked) => {
    if (checked) {
      setMutatingEnabled(true);
      try {
        await setTaskPluginEnabledOption(true);
        setEnabled(true);
      } catch (changeError) {
        setError(changeError.message);
      } finally {
        setMutatingEnabled(false);
      }
      return;
    }
    setConfirmDisable(true);
  };

  const handleDisableConfirmed = async () => {
    setMutatingEnabled(true);
    try {
      await setTaskPluginEnabledOption(false);
      setEnabled(false);
      setConfirmDisable(false);
    } catch (disableError) {
      setError(disableError.message);
    } finally {
      setMutatingEnabled(false);
    }
  };

  const openUpload = (key) => {
    setUploadKey(key ?? null);
    setUploadOpen(true);
  };

  const handleUploaded = async () => {
    await loadPlugins();
  };

  return (
    <Layout>
      <CardPro type='type1' t={t}>
        <div className='flex flex-col gap-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Typography.Title heading={6} style={{ margin: 0 }}>
              {t('任务插件管理')}
            </Typography.Title>
            <div className='flex items-center gap-2'>
              <Spin spinning={enabledLoading || mutatingEnabled} size='small' />
              <Switch
                checked={enabled}
                disabled={enabledLoading || mutatingEnabled}
                onChange={handleEnabledChange}
                aria-label={t('启用任务插件')}
              />
              <Typography.Text>{t('启用任务插件')}</Typography.Text>
              <Tooltip
                content={
                  <div className='max-w-xs text-xs'>
                    <p className='font-medium'>{t('启用任务插件')}</p>
                    <p>
                      {t(
                        '关闭后整个任务插件系统停止服务，包括内建与自定义插件。',
                      )}
                    </p>
                    <p className='font-medium'>{t('内建与自定义插件的行为')}</p>
                    <p>
                      {t(
                        '内建插件不能单独删除或禁用；自定义版本可覆盖内建，删除或禁用该版本即恢复内建。纯第三方平台在其插件被删除或禁用后不可用。',
                      )}
                    </p>
                  </div>
                }
              >
                <Button
                  theme='borderless'
                  type='tertiary'
                  icon={<CircleHelp size={14} />}
                  aria-label={t('内建与自定义插件的行为')}
                />
              </Tooltip>
              {tab === 'installed' ? (
                <Button
                  theme='solid'
                  type='primary'
                  icon={<Upload size={14} />}
                  onClick={() => openUpload()}
                >
                  {t('上传插件')}
                </Button>
              ) : null}
            </div>
          </div>
          {error ? (
            <Banner type='danger' closeIcon={null} description={error} />
          ) : null}
          <Tabs activeKey={tab} onChange={setTab}>
            <Tabs.TabPane tab={t('已安装')} itemKey='installed'>
              <PluginsTable
                plugins={plugins}
                loading={loading}
                t={t}
                onDetails={setDetail}
                onVersions={setVersionsTarget}
                onDryRun={setDryRunTarget}
                onUploadNewVersion={(key) => openUpload(key)}
                onChanged={loadPlugins}
              />
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('插件市场')} itemKey='marketplace'>
              <MarketplacePanel
                installed={plugins}
                onChanged={loadPlugins}
              />
            </Tabs.TabPane>
          </Tabs>
        </div>
      </CardPro>

      <UploadPluginModal
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialKey={uploadKey}
        onUploaded={handleUploaded}
      />
      <PluginDetailModal
        plugin={detail}
        visible={!!detail}
        onClose={() => setDetail(null)}
      />
      <PluginVersionsModal
        plugin={versionsTarget}
        visible={!!versionsTarget}
        onClose={() => setVersionsTarget(null)}
        onChanged={loadPlugins}
      />
      <DryRunModal
        plugin={dryRunTarget}
        visible={!!dryRunTarget}
        onClose={() => setDryRunTarget(null)}
      />

      {/* 关闭总开关前确认：列出仍被绑定渠道占用的自定义插件 */}
      <Modal
        title={t('禁用任务插件系统？')}
        visible={confirmDisable}
        onCancel={() => setConfirmDisable(false)}
        footer={[
          <Button key='cancel' onClick={() => setConfirmDisable(false)}>
            {t('取消')}
          </Button>,
          <Button
            key='ok'
            theme='solid'
            type='danger'
            loading={mutatingEnabled}
            onClick={handleDisableConfirmed}
          >
            {t('禁用')}
          </Button>,
        ]}
      >
        <p>
          {t(
            '内建与自定义插件全部立即停止服务，进行中的任务由超时清理兜底。',
          )}
        </p>
        {overridePlugins.length ? (
          <ul className='list-disc pl-5'>
            {overridePlugins.map((plugin) => (
              <li key={plugin.meta.key}>
                {plugin.meta.name}（{plugin.meta.key}）：
                {t('{{channels}} 个渠道，{{tasks}} 个进行中任务', {
                  channels: plugin.channel_count,
                  tasks: plugin.in_flight_count,
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    </Layout>
  );
};

export default TaskPluginsPanel;
