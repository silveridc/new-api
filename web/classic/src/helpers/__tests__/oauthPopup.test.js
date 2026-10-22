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

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, API: { get: vi.fn(), post: vi.fn() } };
});

import {
  OAUTH_POPUP_CALLBACK_MESSAGE,
  OAUTH_POPUP_RESULT_MESSAGE,
  getOAuthSessionStorage,
  markOAuthPopup,
  resolveOAuthCallbackMode,
  openOAuthPopup,
  handOAuthCallbackToOpener,
} from '../oauthPopup';

const ORIGIN = window.location.origin;

// jsdom 的 MessageEvent 会拒绝普通对象作为 source，这里用普通事件挂上等价字段，
// 被测实现只读取 data/origin/source。
function dispatchMessage(source, data, origin = ORIGIN) {
  const event = new Event('message');
  event.source = source;
  event.origin = origin;
  event.data = data;
  window.dispatchEvent(event);
}

// prepare 是纯微任务，推进几次即可让 .then 里的弹窗逻辑跑完。
const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

function createStorage(throws = false) {
  const map = new Map();
  return {
    getItem: (key) => {
      if (throws) throw new Error('blocked');
      return map.has(key) ? map.get(key) : null;
    },
    setItem: (key, value) => {
      if (throws) throw new Error('blocked');
      map.set(key, value);
    },
  };
}

function createPopup({ storage, blockedStorage = false } = {}) {
  const popup = {
    closed: false,
    posted: [],
    location: { replace: vi.fn() },
    postMessage: vi.fn((message) => popup.posted.push(message)),
    close: () => {
      popup.closed = true;
    },
  };
  Object.defineProperty(popup, 'sessionStorage', {
    configurable: true,
    get: () => {
      if (blockedStorage) throw new Error('blocked');
      return storage ?? null;
    },
  });
  return popup;
}

function stubOpener(opener) {
  Object.defineProperty(window, 'opener', {
    configurable: true,
    writable: true,
    value: opener,
  });
}

describe('popup flow markers', () => {
  it('marks a freshly opened popup and reads the intent back', () => {
    const storage = createStorage();
    expect(markOAuthPopup(storage, 'oidc', 'state-1', 'verify')).toBe(true);
    expect(
      resolveOAuthCallbackMode('oidc', 'state-1', { closed: false }, storage),
    ).toBe('verify');
  });

  it('falls back to login unless provider, state and opener all match', () => {
    const storage = createStorage();
    markOAuthPopup(storage, 'github', 'state-1', 'verify');
    const opener = { closed: false };
    expect(resolveOAuthCallbackMode('github', 'state-2', opener, storage)).toBe(
      'login',
    );
    expect(
      resolveOAuthCallbackMode('discord', 'state-1', opener, storage),
    ).toBe('login');
    expect(resolveOAuthCallbackMode('github', 'state-1', null, storage)).toBe(
      'login',
    );
    expect(
      resolveOAuthCallbackMode('github', 'state-1', { closed: true }, storage),
    ).toBe('login');
  });

  it('treats unreadable or corrupt storage as an ordinary login', () => {
    const blocked = {
      get sessionStorage() {
        throw new Error('privacy mode');
      },
    };
    expect(getOAuthSessionStorage(blocked)).toBeNull();
    expect(getOAuthSessionStorage(null)).toBeNull();
    expect(markOAuthPopup(null, 'oidc', 'state-1', 'verify')).toBe(false);
    expect(markOAuthPopup(createStorage(true), 'oidc', 's', 'verify')).toBe(
      false,
    );
    const broken = createStorage();
    broken.setItem('oauth_popup_flow:oidc', '{not json');
    expect(
      resolveOAuthCallbackMode('oidc', 'state-1', { closed: false }, broken),
    ).toBe('login');
  });
});

describe('openOAuthPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    await expect(
      openOAuthPopup({
        provider: 'oidc',
        intent: 'verify',
        prepare: async () => ({ state: 's', url: 'https://idp/authorize' }),
      }),
    ).rejects.toThrow('授权弹窗被浏览器拦截，请允许弹窗后重试');
  });

  it('stamps the popup, navigates it and hands the callback back', async () => {
    const storage = createStorage();
    const popup = createPopup({ storage });
    vi.spyOn(window, 'open').mockImplementation(() => popup);
    const prepare = vi.fn(async () => ({
      state: 'state-9',
      url: 'https://idp/authorize?state=state-9',
    }));

    const pending = openOAuthPopup({
      provider: 'oidc',
      intent: 'verify',
      prepare,
    });
    await flush();
    expect(resolveOAuthCallbackMode('oidc', 'state-9', popup, storage)).toBe(
      'verify',
    );
    expect(popup.location.replace).toHaveBeenCalledWith(
      'https://idp/authorize?state=state-9',
    );

    // 其他来源、其他 intent、缺少 code/error 的消息都必须被忽略
    dispatchMessage(
      popup,
      {
        type: OAUTH_POPUP_CALLBACK_MESSAGE,
        intent: 'verify',
        provider: 'oidc',
        state: 'state-9',
        code: 'nope',
      },
      'https://evil.example',
    );
    dispatchMessage(popup, {
      type: OAUTH_POPUP_CALLBACK_MESSAGE,
      intent: 'bind',
      provider: 'oidc',
      state: 'state-9',
      code: 'nope',
    });
    dispatchMessage(popup, { type: OAUTH_POPUP_CALLBACK_MESSAGE });

    dispatchMessage(popup, {
      type: OAUTH_POPUP_CALLBACK_MESSAGE,
      intent: 'verify',
      provider: 'oidc',
      state: 'state-9',
      code: 'auth-code',
    });

    const exchange = await pending;
    expect(exchange.callback).toMatchObject({
      provider: 'oidc',
      state: 'state-9',
      code: 'auth-code',
    });
    expect(popup.closed).toBe(false);

    exchange.finish({ success: true });
    expect(popup.posted.at(-1)).toMatchObject({
      type: OAUTH_POPUP_RESULT_MESSAGE,
      intent: 'verify',
      provider: 'oidc',
      state: 'state-9',
      success: true,
    });
    expect(popup.closed).toBe(true);

    // 结算后监听已解除，迟到的消息不再影响结果
    dispatchMessage(popup, {
      type: OAUTH_POPUP_CALLBACK_MESSAGE,
      intent: 'verify',
      provider: 'oidc',
      state: 'state-9',
      code: 'late',
    });
  });

  it('reports the provider error instead of a code', async () => {
    const popup = createPopup({ storage: createStorage() });
    vi.spyOn(window, 'open').mockImplementation(() => popup);
    const pending = openOAuthPopup({
      provider: 'github',
      intent: 'verify',
      prepare: async () => ({ state: 'state-1', url: 'https://gh/authorize' }),
    });
    await flush();
    dispatchMessage(popup, {
      type: OAUTH_POPUP_CALLBACK_MESSAGE,
      intent: 'verify',
      provider: 'github',
      state: 'state-1',
      error: 'access_denied',
      errorDescription: 'user cancelled',
    });
    await expect(pending).resolves.toMatchObject({
      callback: { error: 'access_denied', errorDescription: 'user cancelled' },
    });
  });

  it('rejects when the popup cannot store the marker', async () => {
    const popup = createPopup({ blockedStorage: true });
    vi.spyOn(window, 'open').mockImplementation(() => popup);
    await expect(
      openOAuthPopup({
        provider: 'oidc',
        intent: 'verify',
        prepare: async () => ({ state: 'state-1', url: 'https://idp/a' }),
      }),
    ).rejects.toThrow('无法记录授权窗口状态，请检查浏览器隐私设置后重试。');
    expect(popup.closed).toBe(true);
  });

  it('rejects when the prepare step fails', async () => {
    const popup = createPopup({ storage: createStorage() });
    vi.spyOn(window, 'open').mockImplementation(() => popup);
    await expect(
      openOAuthPopup({
        provider: 'oidc',
        intent: 'verify',
        prepare: async () => {
          throw new Error('OAuth 授权请求失败');
        },
      }),
    ).rejects.toThrow('OAuth 授权请求失败');
    expect(popup.closed).toBe(true);
  });

  it('rejects when the user closes the popup early', async () => {
    const popup = createPopup({ storage: createStorage() });
    vi.spyOn(window, 'open').mockImplementation(() => popup);
    const pending = openOAuthPopup({
      provider: 'oidc',
      intent: 'verify',
      prepare: async () => ({ state: 'state-1', url: 'https://idp/a' }),
    });
    await flush();
    popup.close();
    vi.advanceTimersByTime(600);
    await expect(pending).rejects.toThrow(
      'OAuth 授权窗口已关闭，请重新发起验证。',
    );
  });

  it('gives up after the authorization deadline', async () => {
    const popup = createPopup({ storage: createStorage() });
    vi.spyOn(window, 'open').mockImplementation(() => popup);
    const pending = openOAuthPopup({
      provider: 'oidc',
      intent: 'verify',
      prepare: async () => ({ state: 'state-1', url: 'https://idp/a' }),
    });
    await flush();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1000);
    await expect(pending).rejects.toThrow('OAuth 授权超时，请重新发起验证。');
  });
});

describe('handOAuthCallbackToOpener', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    stubOpener(null);
  });

  it('fails locally when there is no opener', () => {
    stubOpener(null);
    const onFailure = vi.fn();
    const cleanup = handOAuthCallbackToOpener({
      provider: 'oidc',
      intent: 'verify',
      state: 'state-1',
      code: 'c',
      onFailure,
    });
    expect(onFailure).toHaveBeenCalledWith(
      'OAuth 授权窗口已关闭，请重新发起验证。',
    );
    cleanup();
  });

  it('posts the raw authorization result and reports opener success', () => {
    vi.useFakeTimers();
    const posted = [];
    const opener = {
      closed: false,
      postMessage: (message) => posted.push(message),
    };
    stubOpener(opener);
    const onSuccess = vi.fn();
    const cleanup = handOAuthCallbackToOpener({
      provider: 'oidc',
      intent: 'verify',
      state: 'state-1',
      code: 'auth-code',
      onSuccess,
    });
    expect(posted).toEqual([
      {
        type: OAUTH_POPUP_CALLBACK_MESSAGE,
        intent: 'verify',
        provider: 'oidc',
        state: 'state-1',
        code: 'auth-code',
        error: undefined,
        errorDescription: undefined,
      },
    ]);

    dispatchMessage(opener, {
      type: OAUTH_POPUP_RESULT_MESSAGE,
      intent: 'bind',
      provider: 'oidc',
      state: 'state-1',
      success: true,
    });
    expect(onSuccess).not.toHaveBeenCalled();

    dispatchMessage(opener, {
      type: OAUTH_POPUP_RESULT_MESSAGE,
      intent: 'verify',
      provider: 'oidc',
      state: 'state-1',
      success: true,
    });
    expect(onSuccess).toHaveBeenCalled();
    cleanup();
  });

  it('surfaces the opener failure message and the result deadline', () => {
    vi.useFakeTimers();
    const opener = { closed: false, postMessage: vi.fn() };
    stubOpener(opener);
    const onFailure = vi.fn();
    const onTimeout = vi.fn();
    const cleanup = handOAuthCallbackToOpener({
      provider: 'oidc',
      intent: 'verify',
      state: 'state-1',
      code: 'auth-code',
      onFailure,
      onTimeout,
    });

    dispatchMessage(opener, {
      type: OAUTH_POPUP_RESULT_MESSAGE,
      intent: 'verify',
      provider: 'oidc',
      state: 'state-1',
      success: false,
      message: 'SECURITY_VERIFICATION_FAILED',
    });
    expect(onFailure).toHaveBeenCalledWith('SECURITY_VERIFICATION_FAILED');
    cleanup();

    const second = handOAuthCallbackToOpener({
      provider: 'oidc',
      intent: 'verify',
      state: 'state-2',
      code: 'auth-code',
      onTimeout,
    });
    vi.advanceTimersByTime(30 * 1000 + 10);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    second();
  });
});
