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

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Modal, Spin, Typography } from '@douyinfe/semi-ui';
import { Download, FileText } from 'lucide-react';

import { getTaskArtifacts } from '../../../../services/taskArtifacts';

const ARTIFACT_TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  file: '文件',
};

/** 单个产物卡片：图片/视频/音频内联预览 + 下载链接 */
const ArtifactCard = ({ artifact, t }) => {
  const [mediaFailed, setMediaFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const label = t(ARTIFACT_TYPE_LABELS[artifact.type] || ARTIFACT_TYPE_LABELS.file);

  const media = () => {
    if (artifact.type === 'image') {
      return (
        <img
          key={revision}
          src={artifact.content_url}
          alt={artifact.key}
          loading='lazy'
          className='max-h-[50vh] w-full rounded-md object-contain'
          onError={() => setMediaFailed(true)}
        />
      );
    }
    if (artifact.type === 'video') {
      return (
        <video
          key={revision}
          src={artifact.content_url}
          controls
          preload='metadata'
          className='max-h-[50vh] w-full rounded-md bg-black'
          onError={() => setMediaFailed(true)}
        />
      );
    }
    if (artifact.type === 'audio') {
      return (
        <audio
          key={revision}
          src={artifact.content_url}
          controls
          preload='none'
          className='w-full'
          onError={() => setMediaFailed(true)}
        />
      );
    }
    return null;
  };

  return (
    <div className='flex flex-col gap-2 rounded-lg border border-[var(--semi-color-border)] p-3'>
      <div className='flex items-center justify-between gap-2'>
        <Typography.Text strong>
          <FileText size={14} className='mr-1 inline' />
          {label}
        </Typography.Text>
        <a
          href={artifact.content_url}
          download={artifact.key}
          target='_blank'
          rel='noopener noreferrer'
        >
          <Button size='small' theme='borderless' icon={<Download size={14} />}>
            {t('下载')}
          </Button>
        </a>
      </div>
      <Typography.Text type='tertiary' size='small' mono ellipsis={{ showTooltip: true }} style={{ maxWidth: '100%' }}>
        {artifact.key}
        {artifact.mime_type ? ` · ${artifact.mime_type}` : ''}
      </Typography.Text>
      {artifact.type !== 'file' ? (
        mediaFailed ? (
          <Banner
            type='danger'
            closeIcon={null}
            description={t('媒体预览失败，请重试。')}
            action={
              <Button
                size='small'
                onClick={() => {
                  setMediaFailed(false);
                  setRevision((value) => value + 1);
                }}
              >
                {t('重试')}
              </Button>
            }
          />
        ) : (
          media()
        )
      ) : null}
    </div>
  );
};

/**
 * 任务产物弹窗。GET /api/task/:task_id/artifacts（UserAuth），
 * 展示产物列表（视频/音频/图片/文件），兼容 legacy_content_url
 * （旧视频任务）与 legacy_audio_clips（旧 Suno 任务）。
 */
const ArtifactsModal = ({ isModalOpen, setIsModalOpen, taskId }) => {
  const { t } = useTranslation();
  const [projection, setProjection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isModalOpen || !taskId) return;
    setLoading(true);
    setError('');
    setProjection(null);
    getTaskArtifacts(taskId)
      .then((data) => setProjection(data))
      .catch((loadError) => setError(loadError.message || String(loadError)))
      .finally(() => setLoading(false));
  }, [isModalOpen, taskId]);

  return (
    <Modal
      title={t('任务产物：{{taskId}}', { taskId: taskId || '' })}
      visible={isModalOpen}
      onCancel={() => setIsModalOpen(false)}
      width={860}
      footer={<Button onClick={() => setIsModalOpen(false)}>{t('关闭')}</Button>}
    >
      <Spin spinning={loading}>
        {error ? (
          <Banner type='danger' closeIcon={null} description={error} />
        ) : null}
        {projection && projection.artifacts.length === 0 && !projection.legacyContentUrl && !projection.legacyAudioClips?.length ? (
          <Banner
            type='info'
            closeIcon={null}
            description={t('该任务没有产物')}
          />
        ) : null}
        {projection?.legacyContentUrl ? (
          <video
            src={projection.legacyContentUrl}
            controls
            preload='metadata'
            className='max-h-[50vh] w-full rounded-md bg-black'
          />
        ) : null}
        {projection?.legacyAudioClips?.length ? (
          <ul className='list-disc pl-5'>
            {projection.legacyAudioClips.map((clip, index) => (
              <li key={index}>
                <a href={clip.audio_url} target='_blank' rel='noopener noreferrer'>
                  {clip.title || clip.clip_id || clip.audio_url}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {projection?.artifacts.length ? (
          <div
            className={
              projection.artifacts.length > 1
                ? 'grid grid-cols-1 gap-3 lg:grid-cols-2'
                : 'grid grid-cols-1 gap-3'
            }
          >
            {projection.artifacts.map((artifact) => (
              <ArtifactCard key={artifact.key} artifact={artifact} t={t} />
            ))}
          </div>
        ) : null}
      </Spin>
    </Modal>
  );
};

export default ArtifactsModal;
