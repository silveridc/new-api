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

import { API } from '../helpers';

/**
 * 任务产物服务。契约来源：
 * - 新版前端 web/src/features/usage-logs/api.ts getTaskArtifacts（约 123 行）
 *   GET /api/task/:task_id/artifacts（UserAuth，router/api-router.go:382）
 * - 后端 controller/task.go GetDashboardTaskArtifacts/writeTaskArtifacts
 * 响应 data：{ task_id, artifacts: [{key,type,mime_type,content_url}],
 *   legacy_content_url?, legacy_audio_clips? }（非 dashboard 路径为裸 JSON）。
 */

const TASK_ARTIFACT_TYPES = new Set(['image', 'video', 'audio', 'file']);
const SAFE_ARTIFACT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const MAX_TASK_ARTIFACTS = 64;

export class TaskArtifactApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TaskArtifactApiError';
    this.code = code;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/** content_url 必须是带 ?access=token 的同源任务产物链接，逐项校验防注入 */
export function parseArtifactContentUrl(value) {
  if (typeof value !== 'string') {
    throw new TaskArtifactApiError('invalid_content_url');
  }
  const contentUrl = value.trim();
  if (
    contentUrl.length === 0 ||
    contentUrl !== value ||
    contentUrl.includes('#') ||
    !/^https?:\/\//i.test(contentUrl)
  ) {
    throw new TaskArtifactApiError('invalid_content_url');
  }
  for (const character of contentUrl) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f || character === '\\') {
      throw new TaskArtifactApiError('invalid_content_url');
    }
  }
  let url;
  try {
    url = new URL(contentUrl);
  } catch {
    throw new TaskArtifactApiError('invalid_content_url');
  }
  const pathname = url.pathname || '/';
  if (!/\/artifacts\/[^/]+\/content$/.test(pathname)) {
    throw new TaskArtifactApiError('invalid_content_url');
  }
  const accessToken = url.searchParams.get('access');
  if (!accessToken || !/^[A-Za-z0-9_-]{6,}$/.test(accessToken)) {
    throw new TaskArtifactApiError('invalid_content_url');
  }
  return contentUrl;
}

export function parseTaskArtifact(value) {
  if (!isRecord(value)) {
    throw new TaskArtifactApiError('invalid_artifact');
  }
  const key = typeof value.key === 'string' ? value.key : '';
  const type = typeof value.type === 'string' ? value.type : '';
  if (
    key !== key.trim() ||
    !SAFE_ARTIFACT_KEY_PATTERN.test(key) ||
    !TASK_ARTIFACT_TYPES.has(type)
  ) {
    throw new TaskArtifactApiError('invalid_artifact');
  }
  const artifact = { key, type, content_url: parseArtifactContentUrl(value.content_url) };
  if (typeof value.mime_type === 'string' && value.mime_type.trim()) {
    const mimeType = value.mime_type.trim();
    if (mimeType.length > 255 || /[\r\n]/.test(mimeType)) {
      throw new TaskArtifactApiError('invalid_artifact');
    }
    artifact.mime_type = mimeType;
  }
  return artifact;
}

/** 旧 Suno 任务把音频片段列表持久化在 data 中（数组或 JSON 字符串） */
export function parseLegacyAudioClips(data) {
  let values = [];
  if (Array.isArray(data)) {
    values = data;
  } else if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      values = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return values
    .filter(
      (value) =>
        isRecord(value) && typeof value.audio_url === 'string' && value.audio_url,
    )
    .slice(0, MAX_TASK_ARTIFACTS);
}

/** 校验并规范化 /api/task/:id/artifacts 响应（兼容裸 JSON 与 ApiSuccess 包裹两种形态） */
export function parseTaskArtifactsResponse(response) {
  const payload = isRecord(response) ? response : {};
  if (payload.success === false) {
    throw new TaskArtifactApiError(
      payload.message || 'artifact_projection_failed',
      payload.code,
    );
  }
  const data = isRecord(payload.data) ? payload.data : payload;
  const rawArtifacts = data?.artifacts;
  if (rawArtifacts != null && !Array.isArray(rawArtifacts)) {
    throw new TaskArtifactApiError('invalid_artifact_response');
  }
  const artifactValues = rawArtifacts ?? [];
  if (artifactValues.length > MAX_TASK_ARTIFACTS) {
    throw new TaskArtifactApiError('invalid_artifact_response');
  }
  const artifacts = artifactValues.map(parseTaskArtifact);
  const keys = new Set();
  for (const artifact of artifacts) {
    if (keys.has(artifact.key)) {
      throw new TaskArtifactApiError('duplicate_artifact_key');
    }
    keys.add(artifact.key);
  }
  const projection = { artifacts };
  if (data?.legacy_content_url != null) {
    projection.legacyContentUrl = parseArtifactContentUrl(
      data.legacy_content_url,
    );
  }
  if (data?.legacy_audio_clips != null) {
    projection.legacyAudioClips = parseLegacyAudioClips(data.legacy_audio_clips);
  }
  return projection;
}

/** GET /api/task/:task_id/artifacts —— 拉取并解析任务产物列表 */
export async function getTaskArtifacts(taskId) {
  const response = await API.get(
    `/api/task/${encodeURIComponent(taskId)}/artifacts`,
  );
  return parseTaskArtifactsResponse(response?.data);
}

export const TASK_STATUS = {
  SUCCESS: 'SUCCESS',
};

/** 仅成功且未被丢弃的任务需要拉取产物 */
export function shouldLoadTaskArtifacts(log, dialogOpen) {
  return (
    !!dialogOpen &&
    log?.status === TASK_STATUS.SUCCESS &&
    log?.result_discarded !== true
  );
}

/**
 * 预览模式：plugin（产物列表）/ legacy-suno（旧音频）/ legacy-video（旧视频）/
 * discarded（结果未保留）/ none（未成功）。
 */
export function resolveTaskPreviewMode(log) {
  if (log?.status !== TASK_STATUS.SUCCESS) return 'none';
  if (log.result_discarded === true) return 'discarded';
  if (log.platform === 'suno') return 'legacy-suno';
  if (log.legacy_video_available === true) return 'legacy-video';
  return 'plugin';
}
