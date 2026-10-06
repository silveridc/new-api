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

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { API } = vi.hoisted(() => ({
  API: {
    get: vi.fn(),
  },
}));

vi.mock('../../helpers', () => ({ API }));

import {
  TaskArtifactApiError,
  getTaskArtifacts,
  parseTaskArtifactsResponse,
  parseLegacyAudioClips,
  parseArtifactContentUrl,
  shouldLoadTaskArtifacts,
  resolveTaskPreviewMode,
} from '../taskArtifacts';

const CONTENT = 'https://relay.example.com/v1/tasks/t1/artifacts/video/content?access=' + 'a'.repeat(43);

describe('taskArtifacts service contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parseArtifactContentUrl accepts only artifact content URLs with access token', () => {
    expect(parseArtifactContentUrl(CONTENT)).toBe(CONTENT);
    expect(() => parseArtifactContentUrl('https://x.com/other')).toThrowError(
      TaskArtifactApiError,
    );
    expect(() => parseArtifactContentUrl('javascript:alert(1)')).toThrowError(
      TaskArtifactApiError,
    );
    expect(() => parseArtifactContentUrl(CONTENT + '#frag')).toThrowError(
      TaskArtifactApiError,
    );
    expect(
      parseArtifactContentUrl(
        'https://relay.example.com/v1/tasks/t1/artifacts/video/content?access=' + 'a'.repeat(6),
      ),
    ).toBeTruthy();
  });

  it('parseTaskArtifactsResponse validates artifact list', () => {
    const projection = parseTaskArtifactsResponse({
      success: true,
      data: {
        artifacts: [
          { key: 'video', type: 'video', mime_type: 'video/mp4', content_url: CONTENT },
          { key: 'cover.jpg', type: 'image', content_url: CONTENT },
        ],
        legacy_content_url: CONTENT,
        legacy_audio_clips: [{ audio_url: 'https://x/a.mp3' }],
      },
    });
    expect(projection.artifacts).toHaveLength(2);
    expect(projection.artifacts[0].mime_type).toBe('video/mp4');
    expect(projection.legacyContentUrl).toBe(CONTENT);
    expect(projection.legacyAudioClips).toEqual([
      { audio_url: 'https://x/a.mp3' },
    ]);
  });

  it('parseTaskArtifactsResponse rejects bad payloads', () => {
    expect(() =>
      parseTaskArtifactsResponse({ success: false, message: 'gone', code: 'x' }),
    ).toThrowError(TaskArtifactApiError);
    expect(() =>
      parseTaskArtifactsResponse({ success: true, data: { artifacts: 'no' } }),
    ).toThrowError(/invalid_artifact_response/);
    expect(() =>
      parseTaskArtifactsResponse({
        success: true,
        data: { artifacts: [{ key: 'bad key!', type: 'video', content_url: CONTENT }] },
      }),
    ).toThrowError(/invalid_artifact/);
    expect(() =>
      parseTaskArtifactsResponse({
        success: true,
        data: {
          artifacts: [
            { key: 'a', type: 'video', content_url: CONTENT },
            { key: 'a', type: 'image', content_url: CONTENT },
          ],
        },
      }),
    ).toThrowError(/duplicate_artifact_key/);
    // 裸 JSON（非 ApiSuccess 包裹）也可解析
    expect(
      parseTaskArtifactsResponse({ artifacts: [], task_id: 't1' }).artifacts,
    ).toEqual([]);
  });

  it('parseLegacyAudioClips accepts arrays and JSON strings', () => {
    expect(parseLegacyAudioClips([{ audio_url: 'https://x/a.mp3' }, {}])).toEqual([
      { audio_url: 'https://x/a.mp3' },
    ]);
    expect(parseLegacyAudioClips('[{"audio_url":"https://x/b.mp3"}]')).toEqual([
      { audio_url: 'https://x/b.mp3' },
    ]);
    expect(parseLegacyAudioClips('not json')).toEqual([]);
  });

  it('getTaskArtifacts GETs /api/task/:task_id/artifacts and parses', async () => {
    API.get.mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          task_id: 't1',
          artifacts: [{ key: 'audio', type: 'audio', content_url: CONTENT }],
        },
      },
    });
    const projection = await getTaskArtifacts('task/1');
    expect(API.get).toHaveBeenCalledWith('/api/task/task%2F1/artifacts');
    expect(projection.artifacts).toEqual([
      { key: 'audio', type: 'audio', content_url: CONTENT },
    ]);
  });

  it('shouldLoadTaskArtifacts gates on success and non-discarded', () => {
    const log = { status: 'SUCCESS', result_discarded: false };
    expect(shouldLoadTaskArtifacts(log, true)).toBe(true);
    expect(shouldLoadTaskArtifacts(log, false)).toBe(false);
    expect(
      shouldLoadTaskArtifacts({ ...log, result_discarded: true }, true),
    ).toBe(false);
    expect(shouldLoadTaskArtifacts({ status: 'FAILURE' }, true)).toBe(false);
  });

  it('resolveTaskPreviewMode picks the right preview strategy', () => {
    expect(resolveTaskPreviewMode({ status: 'FAILURE' })).toBe('none');
    expect(
      resolveTaskPreviewMode({ status: 'SUCCESS', result_discarded: true }),
    ).toBe('discarded');
    expect(
      resolveTaskPreviewMode({ status: 'SUCCESS', platform: 'suno' }),
    ).toBe('legacy-suno');
    expect(
      resolveTaskPreviewMode({
        status: 'SUCCESS',
        legacy_video_available: true,
      }),
    ).toBe('legacy-video');
    expect(
      resolveTaskPreviewMode({
        status: 'SUCCESS',
        platform: 'video',
        admin_info: { task_plugin: { key: 'sora' } },
      }),
    ).toBe('plugin');
  });
});
