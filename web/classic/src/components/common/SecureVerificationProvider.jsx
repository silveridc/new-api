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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SecureVerificationModal from './modals/SecureVerificationModal';
import {
  SecureVerificationService,
  pickDefaultVerificationMethod,
} from '../../services/secureVerification';
import {
  registerRequestVerificationHandler,
  unregisterRequestVerificationHandler,
} from '../../helpers/secureApiCall';
import { showError, showWarning } from '../../helpers';

const IDLE_STATE = {
  visible: false,
  title: '',
  description: '',
};

const IDLE_METHODS = {
  methods: [],
  availableMethods: [],
  oauthProviders: [],
  passkeySupported: false,
  passwordEncryptionEnabled: false,
};

const IDLE_INPUT = {
  method: null,
  loading: false,
  code: '',
  password: '',
  provider: '',
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
  const [verificationMethods, setVerificationMethods] = useState(IDLE_METHODS);
  const [verificationState, setVerificationState] = useState(IDLE_INPUT);

  const settle = useCallback((proof) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setModalState(IDLE_STATE);
    setVerificationState(IDLE_INPUT);
    pending?.resolve(proof);
  }, []);

  const handleVerify = useCallback(
    async (overrides = {}) => {
      const pending = pendingRef.current;
      if (!pending || verificationState.loading) return;
      const provider =
        overrides.provider ||
        verificationState.provider ||
        verificationMethods.oauthProviders[0]?.slug ||
        '';
      setVerificationState((previous) => ({
        ...previous,
        loading: true,
        provider,
      }));
      try {
        const proof = await SecureVerificationService.verify(
          verificationState.method,
          {
            code: verificationState.code,
            password: verificationState.password,
            provider,
          },
          { scope: pending.scope, context: pending.context },
          verificationMethods,
        );
        settle(proof);
      } catch (error) {
        showError(error.message || t('验证失败，请重试'));
        setVerificationState((previous) => ({
          ...previous,
          loading: false,
          code: '',
          password: '',
        }));
      }
    },
    [
      settle,
      t,
      verificationMethods,
      verificationState.code,
      verificationState.loading,
      verificationState.method,
      verificationState.password,
      verificationState.provider,
    ],
  );

  const handleCancel = useCallback(() => {
    if (verificationState.loading) return;
    settle(null);
  }, [settle, verificationState.loading]);

  const handleMethodSwitch = useCallback((method) => {
    setVerificationState((previous) => ({
      ...previous,
      method,
      code: '',
      password: '',
      provider: '',
    }));
  }, []);

  const handleCodeChange = useCallback((code) => {
    setVerificationState((previous) => ({ ...previous, code }));
  }, []);

  const handlePasswordChange = useCallback((password) => {
    setVerificationState((previous) => ({ ...previous, password }));
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
            if (!methods.methods.length) {
              showError(
                t('您需要先启用两步验证、Passkey 或配置其他可用的安全验证方式'),
              );
              settle(null);
              return;
            }
            const method = pickDefaultVerificationMethod(
              methods,
              options.preferredMethod,
            );
            if (options.preferredMethod && method !== options.preferredMethod) {
              const reason =
                methods.methods.find(
                  (option) => option.method === options.preferredMethod,
                )?.reason || t('该验证方式当前不可用');
              showWarning(reason);
            }
            setVerificationMethods(methods);
            setVerificationState({ ...IDLE_INPUT, method });
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
        onPasswordChange={handlePasswordChange}
        onMethodSwitch={handleMethodSwitch}
        title={modalState.title}
        description={modalState.description}
      />
    </>
  );
};

export default SecureVerificationProvider;
