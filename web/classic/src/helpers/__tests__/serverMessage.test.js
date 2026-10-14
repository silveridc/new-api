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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import i18next from 'i18next';

const toastError = vi.fn();

vi.mock('@douyinfe/semi-ui', () => ({
  Toast: { error: (...args) => toastError(...args) },
  Pagination: () => null,
}));

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { getServerMessage, translateServerText } from '../serverMessage';
import { showError } from '../utils';

const RATE_LIMIT_KEY =
  'Too many email requests. Please wait {{seconds}} seconds and try again.';

describe('server message translation for email rate limits', () => {
  const originalLanguage = i18next.language;

  beforeEach(() => {
    toastError.mockClear();
  });

  afterEach(() => {
    i18next.language = originalLanguage;
  });

  it('translates the rate limit key with its seconds param in Chinese', () => {
    i18next.language = 'zh';

    expect(
      getServerMessage({
        response: {
          data: {
            success: false,
            message_key: RATE_LIMIT_KEY,
            message_params: { seconds: 3600 },
          },
        },
      }),
    ).toBe('邮件发送过于频繁，请等待 3600 秒后再试');
  });

  it('keeps the English source text for a non-Chinese interface', () => {
    i18next.language = 'en';

    expect(translateServerText(RATE_LIMIT_KEY, { seconds: 60 })).toBe(
      RATE_LIMIT_KEY,
    );
  });

  it('shows the server message instead of the generic hint on HTTP 429', () => {
    i18next.language = 'zh';
    const error = new Error('Request failed with status code 429');
    error.name = 'AxiosError';
    error.response = {
      status: 429,
      data: {
        success: false,
        message_key: RATE_LIMIT_KEY,
        message_params: { seconds: 3600 },
      },
    };

    showError(error);

    expect(toastError).toHaveBeenCalledWith(
      '错误：邮件发送过于频繁，请等待 3600 秒后再试',
    );
  });

  it('falls back to the generic hint on HTTP 429 without a known message key', () => {
    i18next.language = 'zh';
    const error = new Error('Request failed with status code 429');
    error.name = 'AxiosError';
    error.response = { status: 429, data: { success: false } };

    showError(error);

    expect(toastError).toHaveBeenCalledWith('错误：请求次数过多，请稍后再试！');
  });
});
