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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SecureVerificationModal from './modals/SecureVerificationModal';
import { SecureVerificationService } from '../../services/secureVerification';
import {
  registerRequestVerificationHandler,
  unregisterRequestVerificationHandler,
} from '../../helpers/secureApiCall';
import { showError } from '../../helpers';

const IDLE_STATE = {
  visible: false,
  title: '',
  description: '',
};

/**
 * 根部安全验证 Provider：配合 helpers/secureApiCall.js 的 requestVerification
 * 使用。任何代码调用 requestVerification({ scope, context }) 时，这里打开
 * 全局 Semi 验证弹窗，验证成功后以 proof 对象兑现 Promise，取消则兑现 null。
 */
const SecureVerificationProvider = ({ children }) => {
  const { t } = useTranslation();
  const pendingRef = useRef(null);
  const [modalState, setModalState] = useState(IDLE_STATE);
  const [verificationMethods, setVerificationMethods] = useState({
    has2FA: false,
    hasPasskey: false,
    passkeySupported: false,
  });
  const [verificationState, setVerificationState] = useState({
    method: null,
    loading: false,
    code: '',
  });

  const settle = useCallback((proof) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setModalState(IDLE_STATE);
    setVerificationState({ method: null, loading: false, code: '' });
    pending?.resolve(proof);
  }, []);

  const handleVerify = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || verificationState.loading) return;
    setVerificationState((previous) => ({ ...previous, loading: true }));
    try {
      const proof = await SecureVerificationService.verify(
        verificationState.method,
        verificationState.code,
        { scope: pending.scope, context: pending.context },
      );
      settle(proof);
    } catch (error) {
      showError(error.message || t('验证失败，请重试'));
      setVerificationState((previous) => ({
        ...previous,
        loading: false,
        code: '',
      }));
    }
  }, [settle, t, verificationState.code, verificationState.loading, verificationState.method]);

  const handleCancel = useCallback(() => {
    if (verificationState.loading) return;
    settle(null);
  }, [settle, verificationState.loading]);

  const handleMethodSwitch = useCallback((method) => {
    setVerificationState((previous) => ({ ...previous, method, code: '' }));
  }, []);

  const handleCodeChange = useCallback((code) => {
    setVerificationState((previous) => ({ ...previous, code }));
  }, []);

  const handleRequestVerification = useCallback(
    (options = {}) => {
      if (pendingRef.current) return Promise.resolve(null);
      return new Promise((resolve) => {
        pendingRef.current = {
          resolve,
          scope: options.scope,
          context: options.context,
        };
        (async () => {
          try {
            const methods =
              await SecureVerificationService.checkAvailableVerificationMethods(
                options.scope,
              );
            if (!methods.has2FA && !methods.hasPasskey) {
              showError(t('您需要先启用两步验证或 Passkey 才能执行此操作'));
              settle(null);
              return;
            }
            let method = options.preferredMethod;
            if (
              method === 'passkey' &&
              (!methods.hasPasskey || !methods.passkeySupported)
            ) {
              method = methods.has2FA ? '2fa' : null;
            }
            if (!method) {
              method =
                methods.hasPasskey && methods.passkeySupported
                  ? 'passkey'
                  : '2fa';
            }
            setVerificationMethods(methods);
            setVerificationState({ method, loading: false, code: '' });
            setModalState({
              visible: true,
              title: options.title,
              description: options.description,
            });
          } catch (error) {
            showError(error.message || t('获取验证方式失败'));
            settle(null);
          }
        })();
      });
    },
    [settle, t],
  );

  useEffect(() => {
    registerRequestVerificationHandler(handleRequestVerification);
    return () => {
      unregisterRequestVerificationHandler(handleRequestVerification);
      settle(null);
    };
  }, [handleRequestVerification, settle]);

  return (
    <>
      {children}
      <SecureVerificationModal
        visible={modalState.visible}
        verificationMethods={verificationMethods}
        verificationState={verificationState}
        onVerify={handleVerify}
        onCancel={handleCancel}
        onCodeChange={handleCodeChange}
        onMethodSwitch={handleMethodSwitch}
        title={modalState.title}
        description={modalState.description}
      />
    </>
  );
};

export default SecureVerificationProvider;
