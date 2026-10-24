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

import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal, Typography } from '@douyinfe/semi-ui';
import {
  API,
  getServerMessage,
  showError,
  showSuccess,
  setUserData,
} from '../../helpers';
import { UserContext } from '../../context/User';
import {
  applyAuthBundle,
  getAuthUser,
  storeUserProfile,
} from '../../helpers/authSession';
import {
  getOAuthSessionStorage,
  resolveOAuthCallbackMode,
  handOAuthCallbackToOpener,
} from '../../helpers/oauthPopup';
import Loading from '../common/ui/Loading';
import TwoFAVerification from './TwoFAVerification';

const OAuth2Callback = (props) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();

  // 防止 React 18 Strict Mode 下重复执行
  const hasExecuted = useRef(false);

  // 账号启用两步验证/Passkey 时，OAuth 登录先返回验证挑战
  const [loginChallenge, setLoginChallenge] = useState(null);

  // 安全验证弹窗模式：handing=已交回原窗口，done=原窗口确认成功，failed=失败
  const [popupPhase, setPopupPhase] = useState(null);
  const [popupMessage, setPopupMessage] = useState('');

  // 最大重试次数
  const MAX_RETRIES = 3;

  const sendCode = async (code, state, retry = 0) => {
    try {
      const { data: resData } = await API.get(
        `/api/oauth/${props.type}?code=${code}&state=${state}`,
      );

      const { success, data } = resData;

      if (!success) {
        // 业务错误不重试，直接显示错误。必须传整个响应体给 getServerMessage，
        // 后端下发的 message_key 是带 {{provider}} 占位符的英文原文，
        // 只有配上 message_params 才能翻成完整的中文。
        showError(
          getServerMessage(resData) || resData.message || t('授权失败'),
        );
        return;
      }

      if (data?.action === 'bind') {
        showSuccess(t('绑定成功！'));
        navigate('/console/personal');
        return;
      }

      // 两步验证挑战：授权流程已消费，弹出验证框完成登录，
      // 不能再次请求回调（state 已被使用）。
      if (data?.require_verification && data?.flow_token) {
        setLoginChallenge(data);
        return;
      }

      const user = applyAuthBundle(data);
      if (!user) throw new Error(t('授权响应无效'));
      userDispatch({ type: 'login', payload: user });
      storeUserProfile(user);
      setUserData(user);
      showSuccess(t('登录成功！'));
      navigate('/console/token');
    } catch (error) {
      // 只对网络错误与服务端 5xx 重试；4xx（如 state 失效）是确定性失败，
      // 重复请求只会把真实错误掩盖成 state 校验失败。
      const status = error?.response?.status;
      const retryable = !status || status >= 500;
      if (retryable && retry < MAX_RETRIES) {
        // 递增的退避等待
        await new Promise((resolve) => setTimeout(resolve, (retry + 1) * 2000));
        return sendCode(code, state, retry + 1);
      }

      // 重试次数耗尽，提示错误并返回设置页面
      showError(
        getServerMessage(error) ||
          error?.response?.data?.message ||
          error.message ||
          t('授权失败'),
      );
      navigate('/console/personal');
    }
  };

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const mode = resolveOAuthCallbackMode(
      props.type,
      state,
      window.opener,
      getOAuthSessionStorage(window),
    );

    // 安全验证弹窗：本页面只负责把授权结果交回发起窗口，proof 由发起窗口
    // 带着自己的登录态去换取，避免这里把会话当成新登录覆盖掉。
    if (mode === 'verify') {
      setPopupPhase('handing');
      return handOAuthCallbackToOpener({
        provider: props.type,
        intent: 'verify',
        state,
        code,
        error: searchParams.get('error'),
        errorDescription: searchParams.get('error_description'),
        onSuccess: () => setPopupPhase('done'),
        onFailure: (message) => {
          setPopupPhase('failed');
          setPopupMessage(
            message || t('OAuth 授权窗口已关闭，请重新发起验证。'),
          );
        },
        onTimeout: () => {
          setPopupPhase('failed');
          setPopupMessage(t('OAuth 授权超时，请返回原窗口重试。'));
        },
      });
    }

    // 防止 React 18 Strict Mode 下重复执行
    if (hasExecuted.current) {
      return;
    }
    hasExecuted.current = true;

    // 参数缺失直接返回
    if (!code) {
      showError(t('未获取到授权码'));
      navigate('/console/personal');
      return;
    }

    sendCode(code, state);
  }, []);

  const handleVerificationSuccess = (data) => {
    const user = getAuthUser(data);
    userDispatch({ type: 'login', payload: user });
    storeUserProfile(user);
    setUserData(user);
    showSuccess(t('登录成功！'));
    navigate('/console/token');
  };

  const handleBackToLogin = () => {
    setLoginChallenge(null);
    navigate('/login');
  };

  // 2FA 验证弹窗（与密码登录共用 TwoFAVerification 组件）
  if (loginChallenge) {
    return (
      <Modal
        title={
          <div className='flex items-center'>
            <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mr-3'>
              <svg
                className='w-4 h-4 text-green-600 dark:text-green-400'
                fill='currentColor'
                viewBox='0 0 20 20'
              >
                <path
                  fillRule='evenodd'
                  d='M6 8a2 2 0 11-4 0 2 2 0 014 0zM8 7a1 1 0 100 2h8a1 1 0 100-2H8zM6 14a2 2 0 11-4 0 2 2 0 014 0zM8 13a1 1 0 100 2h8a1 1 0 100-2H8z'
                  clipRule='evenodd'
                />
              </svg>
            </div>
            {t('两步验证')}
          </div>
        }
        visible={true}
        onCancel={handleBackToLogin}
        footer={null}
        width={450}
        centered
        closable={false}
      >
        <TwoFAVerification
          onSuccess={handleVerificationSuccess}
          onBack={handleBackToLogin}
          isModal={true}
          flowToken={loginChallenge?.flow_token}
        />
      </Modal>
    );
  }

  if (popupPhase) {
    return (
      <div className='flex min-h-screen items-center justify-center p-6'>
        <div className='max-w-md space-y-3 text-center'>
          <Typography.Title heading={4}>{t('安全验证')}</Typography.Title>
          <Typography.Text
            type={popupPhase === 'failed' ? 'danger' : 'tertiary'}
          >
            {popupPhase === 'failed'
              ? popupMessage
              : popupPhase === 'done'
                ? t('验证完成，可以关闭本窗口。')
                : t('已完成授权，正在返回原窗口…')}
          </Typography.Text>
        </div>
      </div>
    );
  }

  return <Loading />;
};

export default OAuth2Callback;
