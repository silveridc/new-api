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

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Input,
  Modal,
  Spin,
  Typography,
} from '@douyinfe/semi-ui';
import { Upload } from 'lucide-react';

import {
  activateTaskPlugin,
  uploadTaskPlugin,
} from '../../services/taskPlugins';
import {
  normalizePluginSourceUrl,
  pluginSourceByteLength,
  fetchPluginSourceText,
  PluginSourceFetchError,
  MAX_PLUGIN_SOURCE_BYTES,
} from '../../services/taskPluginsMarketplace';

const MAX_ICON_BYTES = 512 * 1024;

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file);
  });
}

function readFileDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * 上传插件弹窗。契约：POST /api/plugin/task，JSON body
 * { source, remark, icon? }（后端 taskPluginUploadRequest，非 multipart）。
 * 上传成功且 plugin.active === false 时提供「立即激活」。
 */
const UploadPluginModal = ({ visible, onClose, initialKey, onUploaded }) => {
  const { t } = useTranslation();
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [remark, setRemark] = useState('');
  const [icon, setIcon] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const sourceInputRef = useRef(null);
  const iconInputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setSource('');
      setFileName('');
      setRemark('');
      setIcon('');
      setImportUrl('');
      setError('');
      setResult(null);
    }
  }, [visible, initialKey]);

  const handleSourceFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_PLUGIN_SOURCE_BYTES) {
      setError(t('插件源码超过 8 MiB 上限'));
      return;
    }
    try {
      const text = await readFileText(file);
      setSource(text);
      setFileName(file.name);
      setResult(null);
      setError('');
    } catch {
      setError(t('读取文件失败'));
    }
  };

  const handleIconFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(svg|png)$/i.test(file.name)) {
      setError(t('插件图标必须是 .svg 或 .png 文件'));
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setError(t('插件图标超过 512 KiB 上限'));
      return;
    }
    try {
      setIcon(await readFileDataUri(file));
      setError('');
      setResult(null);
    } catch {
      setError(t('读取图标失败'));
    }
  };

  const handleImportUrl = async () => {
    const normalized = normalizePluginSourceUrl(importUrl);
    if (!normalized) {
      setError(t('请输入有效的 http(s) 插件地址'));
      return;
    }
    setImporting(true);
    setError('');
    try {
      const text = await fetchPluginSourceText(normalized);
      setSource(text);
      setFileName('');
      setResult(null);
    } catch (fetchError) {
      if (fetchError instanceof PluginSourceFetchError) {
        setError(
          fetchError.reason === 'too_large'
            ? t('插件源码超过 8 MiB 上限')
            : t('无法抓取插件源码：主机可能限制了跨域请求或不可达'),
        );
      } else {
        setError(fetchError.message);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const detail = await uploadTaskPlugin({ source, remark, icon });
      setResult(detail);
      await onUploaded?.();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async () => {
    if (!result) return;
    setActivating(true);
    try {
      await activateTaskPlugin(result.meta.key, result.meta.version);
      await onUploaded?.();
      onClose();
    } catch (activateError) {
      setError(activateError.message);
    } finally {
      setActivating(false);
    }
  };

  const needsActivation = result?.plugin?.active === false;

  if (result) {
    return (
      <Modal
        title={t('插件上传成功')}
        visible={visible}
        onCancel={onClose}
        footer={[
          <Button key='close' onClick={onClose}>
            {needsActivation ? t('稍后') : t('关闭')}
          </Button>,
          needsActivation ? (
            <Button
              key='activate'
              theme='solid'
              type='primary'
              loading={activating}
              onClick={handleActivate}
            >
              {t('立即激活')}
            </Button>
          ) : null,
        ].filter(Boolean)}
      >
        <Banner
          type={needsActivation ? 'warning' : 'success'}
          closeIcon={null}
          description={
            needsActivation
              ? t('该版本已保存但未激活。激活后才会替换当前版本，也可稍后在版本列表中激活。')
              : t('插件版本已激活')
          }
        />
        <p className='mt-2'>
          {result.meta?.name}（{result.meta?.key}）· v{result.meta?.version}
        </p>
        {error ? (
          <Banner type='danger' closeIcon={null} description={error} />
        ) : null}
      </Modal>
    );
  }

  return (
    <Modal
      title={
        initialKey
          ? t('上传插件新版本')
          : t('上传任务插件')
      }
      visible={visible}
      onCancel={onClose}
      width={720}
      footer={[
        <Button key='cancel' disabled={submitting} onClick={onClose}>
          {t('取消')}
        </Button>,
        <Button
          key='submit'
          theme='solid'
          type='primary'
          icon={<Upload size={14} />}
          loading={submitting}
          disabled={!source.trim()}
          onClick={handleSubmit}
        >
          {t('上传')}
        </Button>,
      ]}
    >
      <Banner
        type='warning'
        closeIcon={null}
        className='!mb-3'
        description={t(
          '上传插件是管理员级信任决定：插件可访问渠道凭证并改写上游请求，请先审查源码再激活。',
        )}
      />
      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button onClick={() => sourceInputRef.current?.click()}>
            {t('选择 .js 文件')}
          </Button>
          {fileName ? (
            <Typography.Text small>{fileName}</Typography.Text>
          ) : null}
          <input
            ref={sourceInputRef}
            type='file'
            accept='.js,.mjs,text/javascript'
            className='hidden'
            onChange={handleSourceFile}
          />
        </div>
        <div className='flex items-center gap-2'>
          <Input
            placeholder={t('或粘贴插件源码 URL（支持 GitHub/gist 页面链接）')}
            value={importUrl}
            onChange={setImportUrl}
          />
          <Button loading={importing} onClick={handleImportUrl}>
            {t('抓取')}
          </Button>
        </div>
        <div>
          <div className='mb-1 flex items-center justify-between'>
            <Typography.Text strong size='small'>
              {t('插件源码')}
            </Typography.Text>
            <Typography.Text type='tertiary' size='small'>
              {pluginSourceByteLength(source)} bytes / {MAX_PLUGIN_SOURCE_BYTES} bytes
            </Typography.Text>
          </div>
          <Spin spinning={importing}>
            <textarea
              aria-label={t('插件源码')}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setResult(null);
              }}
              placeholder={t('在此粘贴 JavaScript 插件源码…')}
              rows={14}
              spellCheck={false}
              className='w-full rounded-md border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-2 font-mono text-xs'
            />
          </Spin>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button onClick={() => iconInputRef.current?.click()}>
            {t('选择图标（可选）')}
          </Button>
          {icon ? (
            <>
              <img src={icon} alt={t('插件图标')} className='h-8 w-8' />
              <Button type='danger' theme='borderless' onClick={() => setIcon('')}>
                {t('移除')}
              </Button>
            </>
          ) : null}
          <input
            ref={iconInputRef}
            type='file'
            accept='.svg,.png,image/svg+xml,image/png'
            className='hidden'
            onChange={handleIconFile}
          />
        </div>
        <Input
          placeholder={t('备注（可选，描述该版本的用途）')}
          value={remark}
          onChange={setRemark}
        />
        {error ? (
          <Banner type='danger' closeIcon={null} description={error} />
        ) : null}
      </div>
    </Modal>
  );
};

export default UploadPluginModal;
