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

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react';

import {
  activateTaskPlugin,
  listMarketplaceSources,
  uploadTaskPlugin,
  updateMarketplaceSources,
} from '../../services/taskPlugins';
import {
  computeSourceSha256,
  deriveInstallState,
  fetchPluginSourceText,
  findMarketplaceVersion,
  indexHasIntegrityHashes,
  isDefaultMarketplaceSource,
  parseMarketplaceIndex,
  resolvePluginSourceUrl,
} from '../../services/taskPluginsMarketplace';

/** 市场源管理：GET/PUT /api/plugin/task/marketplace/sources */
export const MarketplaceSourcesModal = ({
  visible,
  onClose,
  onSaved,
  t,
}) => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    listMarketplaceSources()
      .then((list) => setSources(list.map((item) => ({ ...item }))))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [visible]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateMarketplaceSources(
        sources.map((item) => ({
          name: (item.name || '').trim(),
          index_url: (item.index_url || '').trim(),
        })),
      );
      await onSaved?.();
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('管理市场源')}
      visible={visible}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key='cancel' onClick={onClose}>
          {t('取消')}
        </Button>,
        <Button
          key='save'
          theme='solid'
          type='primary'
          loading={saving}
          onClick={handleSave}
        >
          {t('保存')}
        </Button>,
      ]}
    >
      {error ? <Banner type='danger' closeIcon={null} description={error} /> : null}
      <Spin spinning={loading}>
        <div className='flex flex-col gap-2'>
          {sources.map((source, index) => (
            <div key={index} className='flex items-center gap-2'>
              <Input
                style={{ width: 160 }}
                placeholder={t('名称')}
                value={source.name}
                onChange={(value) =>
                  setSources((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, name: value } : item,
                    ),
                  )
                }
              />
              <Input
                placeholder={t('索引 URL（index.json）')}
                value={source.index_url}
                onChange={(value) =>
                  setSources((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, index_url: value } : item,
                    ),
                  )
                }
              />
              <Button
                type='danger'
                theme='borderless'
                icon={<Trash2 size={14} />}
                onClick={() =>
                  setSources((prev) => prev.filter((_, i) => i !== index))
                }
              />
            </div>
          ))}
          <Button
            icon={<Plus size={14} />}
            onClick={() =>
              setSources((prev) => [...prev, { name: '', index_url: '' }])
            }
          >
            {t('添加源')}
          </Button>
        </div>
      </Spin>
    </Modal>
  );
};

const INSTALL_STATE_META = {
  not_installed: { color: 'blue', label: '未安装' },
  up_to_date: { color: 'green', label: '已是最新' },
  upgradable: { color: 'orange', label: '可升级' },
  diverged: { color: 'red', label: '本地版本不在索引中' },
};

/**
 * 插件市场：索引由浏览器直接抓取（网关不代理，无 SSRF 面）。
 * 安装走与手动上传相同的准入管线：POST /api/plugin/task
 * { source, sourceSha256, enabled: true, remark, icon }。
 */
const MarketplacePanel = ({ installed, onChanged, t: tProp }) => {
  const { t } = useTranslation();
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [index, setIndex] = useState(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [digest, setDigest] = useState(null);

  const selectedSource =
    sources.find((item) => item.index_url === selectedUrl) ?? sources[0];

  const loadSources = async () => {
    setSourcesLoading(true);
    try {
      const list = await listMarketplaceSources();
      setSources(list);
      setSelectedUrl((prev) =>
        prev && list.some((item) => item.index_url === prev)
          ? prev
          : list[0]?.index_url ?? '',
      );
    } catch (loadError) {
      setIndexError(loadError.message);
    } finally {
      setSourcesLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIndex = async () => {
    if (!selectedSource) return;
    setIndexLoading(true);
    setIndexError('');
    try {
      const response = await fetch(selectedSource.index_url, {
        cache: 'no-cache',
      });
      if (!response.ok) {
        throw new Error(t('索引请求失败：HTTP {{status}}', { status: response.status }));
      }
      setIndex(parseMarketplaceIndex(await response.json()));
    } catch (fetchError) {
      setIndex(null);
      setIndexError(
        t('索引抓取或解析失败：{{message}}。主机可能阻止了跨域请求。', {
          message: fetchError.message,
        }),
      );
    } finally {
      setIndexLoading(false);
    }
  };

  useEffect(() => {
    loadIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource?.index_url]);

  // 安装确认弹窗打开时抓取源码并计算摘要（仅展示用，权威校验在服务端）
  useEffect(() => {
    if (!installTarget) return;
    const entry = findMarketplaceVersion(
      installTarget.plugin,
      installTarget.version,
    );
    if (!entry) return;
    const url = resolvePluginSourceUrl(installTarget.source.index_url, entry.path);
    if (!url) {
      setInstallError(t('插件路径无法解析到源仓库内'));
      setSourceText('');
      return;
    }
    setInstallError('');
    setSourceText('');
    setDigest(null);
    fetchPluginSourceText(url)
      .then(async (text) => {
        setSourceText(text);
        setDigest(await computeSourceSha256(text));
      })
      .catch((fetchError) => {
        setInstallError(
          fetchError.reason === 'too_large'
            ? t('插件源码超过 8 MiB 上限')
            : t('无法抓取插件源码：主机可能限制了跨域请求或不可达'),
        );
      });
  }, [installTarget, t]);

  const digestMismatch = useMemo(() => {
    const entry = installTarget
      ? findMarketplaceVersion(installTarget.plugin, installTarget.version)
      : null;
    if (!entry?.sha256 || !digest) return false;
    return digest.toLowerCase() !== entry.sha256.toLowerCase();
  }, [installTarget, digest]);

  const handleInstall = async () => {
    if (!installTarget || !sourceText || digestMismatch) return;
    const entry = findMarketplaceVersion(
      installTarget.plugin,
      installTarget.version,
    );
    setInstalling(true);
    setInstallError('');
    try {
      const detail = await uploadTaskPlugin({
        source: sourceText,
        sourceSha256: entry?.sha256,
        enabled: true,
        remark: `${installTarget.source.name} v${installTarget.version}`,
      });
      if (detail?.plugin && detail.plugin.active === false) {
        await activateTaskPlugin(detail.meta.key, detail.meta.version);
      }
      setInstallTarget(null);
      await onChanged?.();
    } catch (installFailure) {
      setInstallError(installFailure.message);
    } finally {
      setInstalling(false);
    }
  };

  const official = selectedSource
    ? isDefaultMarketplaceSource(selectedSource.index_url)
    : false;
  const missingHashes = index ? !indexHasIntegrityHashes(index) : false;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Typography.Text type='tertiary' size='small'>
          {t('插件索引由浏览器直接抓取；安装与手动上传走同样的审查准入流程。')}
        </Typography.Text>
        <div className='flex gap-2'>
          <Button
            icon={<RefreshCw size={14} />}
            loading={indexLoading}
            disabled={!selectedSource}
            onClick={loadIndex}
          >
            {t('刷新')}
          </Button>
          <Button
            icon={<Settings2 size={14} />}
            onClick={() => setSourcesOpen(true)}
          >
            {t('管理源')}
          </Button>
        </div>
      </div>

      {sources.length > 1 ? (
        <Select
          style={{ width: 280 }}
          value={selectedSource?.index_url}
          onChange={(value) => setSelectedUrl(value)}
          optionList={sources.map((source) => ({
            value: source.index_url,
            label: source.name,
          }))}
        />
      ) : null}

      {selectedSource ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Typography.Text strong>{index?.name || selectedSource.name}</Typography.Text>
          {official ? (
            <Tag color='green' size='small'>
              {t('官方')}
            </Tag>
          ) : (
            <Tag color='red' size='small'>
              {t('第三方，风险自负')}
            </Tag>
          )}
          {missingHashes ? (
            <Tag color='red' size='small'>
              {t('无完整性校验')}
            </Tag>
          ) : null}
        </div>
      ) : null}

      {indexError ? (
        <Banner type='danger' closeIcon={null} description={indexError} />
      ) : null}

      <Spin spinning={sourcesLoading || indexLoading}>
        {index && index.plugins.length === 0 ? (
          <Empty description={t('该源暂无可安装的任务插件')} />
        ) : null}
        {index && index.plugins.length > 0 ? (
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {index.plugins.map((plugin) => {
              const state = deriveInstallState(plugin, installed);
              const meta = INSTALL_STATE_META[state.status];
              return (
                <div
                  key={plugin.key}
                  className='flex flex-col gap-2 rounded-lg border border-[var(--semi-color-border)] p-3'
                >
                  <div className='flex items-center justify-between gap-2'>
                    <Typography.Text strong>{plugin.name}</Typography.Text>
                    <Tag color={meta.color} size='small'>
                      {t(meta.label)}
                    </Tag>
                  </div>
                  <Typography.Text type='tertiary' size='small' ellipsis={{ showTooltip: true }} style={{ maxWidth: '100%' }}>
                    {typeof plugin.description === 'string'
                      ? plugin.description
                      : (plugin.description?.['zh'] ?? plugin.description?.en ?? '')}
                  </Typography.Text>
                  <div className='flex flex-wrap gap-1'>
                    <Tag size='small'>{plugin.latest}</Tag>
                    {(plugin.models ?? []).slice(0, 3).map((model) => (
                      <Tag key={model} size='small' color='white'>
                        {model}
                      </Tag>
                    ))}
                  </div>
                  <div>
                    <Button
                      size='small'
                      theme='solid'
                      type='primary'
                      disabled={state.status === 'up_to_date'}
                      onClick={() =>
                        setInstallTarget({
                          source: selectedSource,
                          plugin,
                          version: plugin.latest,
                          installState: state,
                        })
                      }
                    >
                      {state.status === 'up_to_date'
                        ? t('已安装')
                        : state.status === 'not_installed'
                          ? t('安装')
                          : t('安装并启用')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Spin>

      <MarketplaceSourcesModal
        visible={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        onSaved={loadSources}
        t={t}
      />

      <Modal
        title={t('安装插件：{{name}}', { name: installTarget?.plugin?.name })}
        visible={!!installTarget}
        onCancel={() => {
          if (!installing) setInstallTarget(null);
        }}
        width={680}
        footer={[
          <Button key='cancel' disabled={installing} onClick={() => setInstallTarget(null)}>
            {t('取消')}
          </Button>,
          <Button
            key='install'
            theme='solid'
            type='primary'
            loading={installing}
            disabled={!sourceText || digestMismatch}
            onClick={handleInstall}
          >
            {t('安装并启用')}
          </Button>,
        ]}
      >
        <p>
          {t('版本 v{{version}}，来自 {{source}}', {
            version: installTarget?.version,
            source: installTarget?.source?.name,
          })}
        </p>
        {installTarget?.installState?.status === 'upgradable' ? (
          <Banner
            type='info'
            closeIcon={null}
            className='!my-2'
            description={t('当前已安装 v{{installed}}，将升级到 v{{latest}}。', {
              installed: installTarget.installState.installedVersion,
              latest: installTarget.installState.latestVersion,
            })}
          />
        ) : null}
        {installTarget?.installState?.status === 'diverged' ? (
          <Banner
            type='warning'
            closeIcon={null}
            className='!my-2'
            description={t(
              '本地版本 v{{installed}} 不在索引中，安装会覆盖它（可能是手动上传或源已回滚）。',
              { installed: installTarget.installState.installedVersion },
            )}
          />
        ) : null}
        {missingHashes ? (
          <Banner
            type='warning'
            closeIcon={null}
            className='!my-2'
            description={t('该源未提供 sha256，无法进行完整性校验。')}
          />
        ) : null}
        {digestMismatch ? (
          <Banner
            type='danger'
            closeIcon={null}
            className='!my-2'
            description={t(
              '源码摘要与索引 sha256 不一致，请刷新索引后再试；不一致说明源码可能被篡改。',
            )}
          />
        ) : null}
        {installError ? (
          <Banner type='danger' closeIcon={null} className='!my-2' description={installError} />
        ) : null}
        <Spin spinning={!sourceText && !installError}>
          <pre className='max-h-72 overflow-auto rounded-md border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-2 font-mono text-xs'>
            {sourceText ? sourceText.slice(0, 20000) : ''}
          </pre>
        </Spin>
      </Modal>
    </div>
  );
};

export default MarketplacePanel;
