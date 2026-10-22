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

/**
 * OAuth 弹窗传输层：安全验证（intent=verify）需要在不离开当前页面的前提下
 * 完成一次第三方授权，因此回调页只把 code/state 交给发起窗口，由发起窗口
 * 自己带上登录态去请求 /api/oauth/:provider。
 *
 * 判定「弹窗流程」需要三重证据：本窗口是自己打开的、同源 sessionStorage 里
 * 有本 provider+state 的标记、且 intent 明确。任一缺失都按普通登录回调处理，
 * 因为登录流程能自行恢复，而误判成弹窗只会让流程卡到超时。
 */

export const OAUTH_POPUP_CALLBACK_MESSAGE = 'oauth:popup:callback';
export const OAUTH_POPUP_RESULT_MESSAGE = 'oauth:popup:result';

const POPUP_FLOW_KEY_PREFIX = 'oauth_popup_flow:';
const CLOSE_WATCH_INTERVAL_MS = 500;
const CALLBACK_DEADLINE_MS = 10 * 60 * 1000;
const RESULT_DEADLINE_MS = 30 * 1000;

export function getOAuthSessionStorage(owner) {
  try {
    return owner?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function markOAuthPopup(storage, provider, state, intent) {
  if (!storage || !provider || !state) return false;
  try {
    const key = `${POPUP_FLOW_KEY_PREFIX}${provider}`;
    const marker = JSON.stringify({ state, intent });
    storage.setItem(key, marker);
    return storage.getItem(key) === marker;
  } catch {
    return false;
  }
}

export function resolveOAuthCallbackMode(provider, state, opener, storage) {
  if (!opener || opener.closed || !storage || !state) return 'login';
  try {
    const value = storage.getItem(`${POPUP_FLOW_KEY_PREFIX}${provider}`);
    if (!value) return 'login';
    const marker = JSON.parse(value);
    if (!marker || marker.state !== state) return 'login';
    if (marker.intent === 'bind' || marker.intent === 'verify') {
      return marker.intent;
    }
  } catch {
    return 'login';
  }
  return 'login';
}

export function watchOAuthPopupClosed(
  popup,
  onClosed,
  interval = CLOSE_WATCH_INTERVAL_MS,
) {
  let active = true;
  const handle = setInterval(() => {
    if (!active) return;
    if (!popup.closed) return;
    active = false;
    clearInterval(handle);
    onClosed();
  }, interval);
  return () => {
    active = false;
    clearInterval(handle);
  };
}

function startDeadline(onTimeout, delay) {
  let active = true;
  const handle = setTimeout(() => {
    if (!active) return;
    active = false;
    onTimeout();
  }, delay);
  return () => {
    if (!active) return;
    active = false;
    clearTimeout(handle);
  };
}

/**
 * 回调页把授权结果交还给发起窗口，并等待对方回执（成功即关闭，失败展示错误）。
 * 返回的清理函数在组件卸载时调用。
 */
export function handOAuthCallbackToOpener({
  provider,
  intent,
  state,
  code,
  error,
  errorDescription,
  onSuccess,
  onFailure,
  onTimeout,
}) {
  const opener = window.opener;
  if (!opener || opener.closed) {
    onFailure?.('OAuth 授权窗口已关闭，请重新发起验证。');
    return () => undefined;
  }
  let removeListener = () => undefined;
  let cancelResult = () => undefined;
  const handleResult = (event) => {
    if (event.origin !== window.location.origin || event.source !== opener) {
      return;
    }
    const result = event.data;
    if (
      !result ||
      result.type !== OAUTH_POPUP_RESULT_MESSAGE ||
      result.intent !== intent ||
      result.provider !== provider ||
      result.state !== state
    ) {
      return;
    }
    cancelResult();
    removeListener();
    if (result.success) {
      onSuccess?.();
      return;
    }
    onFailure?.(result.message);
  };
  window.addEventListener('message', handleResult);
  removeListener = () => window.removeEventListener('message', handleResult);
  cancelResult = startDeadline(() => {
    removeListener();
    onTimeout?.();
  }, RESULT_DEADLINE_MS);
  opener.postMessage(
    {
      type: OAUTH_POPUP_CALLBACK_MESSAGE,
      intent,
      provider,
      state,
      code,
      error,
      errorDescription,
    },
    window.location.origin,
  );
  return () => {
    removeListener();
    cancelResult();
  };
}

/**
 * 打开 OAuth 授权弹窗并在拿到回调后兑现。prepare 负责申请 state 与授权 URL，
 * 因为弹窗必须在同一轮里立刻被标记，否则回调页无法识别自己是弹窗流程。
 */
export function openOAuthPopup({ provider, intent, prepare }) {
  const popup = window.open('', '_blank');
  if (!popup) {
    return Promise.reject(new Error('授权弹窗被浏览器拦截，请允许弹窗后重试'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let state = '';
    let stopCloseWatch = () => undefined;
    let cancelDeadline = () => undefined;
    let removeListener = () => undefined;

    const stopWaiting = () => {
      removeListener();
      stopCloseWatch();
      cancelDeadline();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      stopWaiting();
      if (!popup.closed) popup.close();
      reject(
        error instanceof Error ? error : new Error('OAuth 授权失败，请重试。'),
      );
    };

    stopCloseWatch = watchOAuthPopupClosed(popup, () =>
      fail(new Error('OAuth 授权窗口已关闭，请重新发起验证。')),
    );
    cancelDeadline = startDeadline(
      () => fail(new Error('OAuth 授权超时，请重新发起验证。')),
      CALLBACK_DEADLINE_MS,
    );

    prepare(provider, intent)
      .then((authorization) => {
        state = authorization.state;
        if (settled || popup.closed) {
          fail(new Error('OAuth 授权窗口已关闭，请重新发起验证。'));
          return;
        }
        if (
          !markOAuthPopup(
            getOAuthSessionStorage(popup),
            provider,
            state,
            intent,
          )
        ) {
          fail(new Error('无法记录授权窗口状态，请检查浏览器隐私设置后重试。'));
          return;
        }
        const onMessage = (event) => {
          if (
            event.origin !== window.location.origin ||
            event.source !== popup
          ) {
            return;
          }
          const message = event.data;
          if (
            !message ||
            message.type !== OAUTH_POPUP_CALLBACK_MESSAGE ||
            message.intent !== intent ||
            message.provider !== provider ||
            message.state !== state
          ) {
            return;
          }
          if (
            typeof message.code !== 'string' &&
            typeof message.error !== 'string'
          ) {
            return;
          }
          if (settled) return;
          settled = true;
          // 弹窗要活到 finish() 回执之后，所以这里只解除监听，不关闭窗口。
          stopWaiting();
          resolve({
            callback: {
              provider,
              state,
              code: message.code,
              error: message.error,
              errorDescription: message.errorDescription,
            },
            finish: (result) => {
              if (popup.closed) return;
              popup.postMessage(
                {
                  type: OAUTH_POPUP_RESULT_MESSAGE,
                  intent,
                  provider,
                  state,
                  ...result,
                },
                window.location.origin,
              );
              popup.close();
            },
          });
        };
        window.addEventListener('message', onMessage);
        removeListener = () => window.removeEventListener('message', onMessage);
        popup.location.replace(authorization.url);
      })
      .catch(fail);
  });
}
