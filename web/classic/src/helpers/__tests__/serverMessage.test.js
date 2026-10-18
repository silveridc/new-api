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

describe('server message translation for the two-factor lockout', () => {
  const originalLanguage = i18next.language;
  const LOCKED_KEY = 'Two-factor authentication is temporarily locked.';

  beforeEach(() => {
    toastError.mockClear();
  });

  afterEach(() => {
    i18next.language = originalLanguage;
  });

  it('translates the lockout key with its error code in Chinese', () => {
    i18next.language = 'zh';

    expect(
      getServerMessage({
        response: {
          data: {
            success: false,
            code: 'SECURITY_VERIFICATION_LOCKED',
            message: LOCKED_KEY,
            message_key: LOCKED_KEY,
          },
        },
      }),
    ).toBe('两步验证已暂时锁定。');
  });

  it('reaches the lockout text from the error code when the message key is unknown', () => {
    i18next.language = 'zh';

    expect(
      getServerMessage({
        response: {
          data: {
            success: false,
            code: 'SECURITY_VERIFICATION_LOCKED',
            message: 'Something the table does not know',
            message_key: 'Something the table does not know',
          },
        },
      }),
    ).toBe('两步验证已暂时锁定。');
  });

  it('shows the lockout text instead of the raw English message', () => {
    i18next.language = 'zh';

    // TwoFAVerification 把业务响应的 message 原文交给 showError
    showError(LOCKED_KEY);

    expect(toastError).toHaveBeenCalledWith('错误：两步验证已暂时锁定。');
  });

  it('keeps the English source text for a non-Chinese interface', () => {
    i18next.language = 'en';

    expect(translateServerText(LOCKED_KEY)).toBe(LOCKED_KEY);
  });
});

describe('showError status handling', () => {
  const originalLanguage = i18next.language;
  const LOCKED_KEY = 'Two-factor authentication is temporarily locked.';

  afterEach(() => {
    i18next.language = originalLanguage;
  });

  // 断网、超时、DNS 失败的 axios 错误没有 response 属性，状态码无从读取。
  const axiosError = (message, status, data) => {
    const error = new Error(message);
    error.name = 'AxiosError';
    if (status !== undefined) {
      error.response = { status, data };
    }
    return error;
  };

  it('shows the connectivity hint instead of throwing without a response', () => {
    i18next.language = 'zh';

    expect(() => showError(axiosError('Network Error'))).not.toThrow();
    expect(toastError).toHaveBeenCalledWith(
      '错误：无法连接服务器，请检查网络后重试！',
    );
  });

  it('covers a timeout, which also carries no response', () => {
    i18next.language = 'zh';

    expect(() =>
      showError(axiosError('timeout of 5000ms exceeded')),
    ).not.toThrow();
    expect(toastError).toHaveBeenCalledWith(
      '错误：无法连接服务器，请检查网络后重试！',
    );
  });

  it('still uses a server message carried on the error when there is no response', () => {
    i18next.language = 'zh';
    const error = axiosError('Network Error');
    error.message_key = LOCKED_KEY;

    showError(error);

    expect(toastError).toHaveBeenCalledWith('错误：两步验证已暂时锁定。');
  });

  it('keeps the per-status hints for responses that do exist', () => {
    i18next.language = 'zh';

    showError(axiosError('Request failed', 500, { success: false }));
    expect(toastError).toHaveBeenLastCalledWith(
      '错误：服务器内部错误，请联系管理员！',
    );

    showError(
      axiosError('Request failed', 429, {
        success: false,
        message_key: RATE_LIMIT_KEY,
        message_params: { seconds: 60 },
      }),
    );
    expect(toastError).toHaveBeenLastCalledWith(
      '错误：邮件发送过于频繁，请等待 60 秒后再试',
    );
  });

  it('falls through to the server message for an unmapped status', () => {
    i18next.language = 'zh';

    showError(
      axiosError('Request failed with status code 409', 409, {
        success: false,
        message_key: LOCKED_KEY,
      }),
    );

    expect(toastError).toHaveBeenCalledWith('错误：两步验证已暂时锁定。');
  });
});
