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

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SecureVerificationService,
  pickDefaultVerificationMethod,
} from '../../services/secureVerification';
import { showError, showSuccess, showWarning } from '../../helpers';

const IDLE_METHODS = {
  methods: [],
  availableMethods: [],
  oauthProviders: [],
  has2FA: false,
  hasPasskey: false,
  hasPassword: false,
  hasOAuth: false,
  passkeySupported: false,
  passwordEncryptionEnabled: false,
};

export const emptyVerificationInput = () => ({
  code: '',
  password: '',
  provider: '',
});

/**
 * 二次验证流程的状态机：先向 /api/verify/methods 询问该 scope 允许哪些方式，
 * 再按用户选择的方式取得 proof，最后用 proof 执行调用方传入的 apiCall。
 */
export const useSecureVerification = ({
  onSuccess,
  onError,
  successMessage,
  autoReset = true,
} = {}) => {
  const { t } = useTranslation();
  const [verificationMethods, setVerificationMethods] = useState(IDLE_METHODS);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [verificationState, setVerificationState] = useState({
    method: null,
    loading: false,
    apiCall: null,
    scope: 'channel.key.read',
    context: undefined,
    ...emptyVerificationInput(),
  });

  const checkVerificationMethods = useCallback(
    async (scope = 'channel.key.read') => {
      const methods =
        await SecureVerificationService.checkAvailableVerificationMethods(
          scope,
        );
      setVerificationMethods(methods);
      return methods;
    },
    [],
  );

  useEffect(() => {
    void checkVerificationMethods();
  }, [checkVerificationMethods]);

  const resetState = useCallback(() => {
    setVerificationState({
      method: null,
      loading: false,
      apiCall: null,
      scope: 'channel.key.read',
      context: undefined,
      ...emptyVerificationInput(),
    });
    setIsModalVisible(false);
  }, []);

  const startVerification = useCallback(
    async (apiCall, options = {}) => {
      const {
        preferredMethod,
        title,
        description,
        scope = 'channel.key.read',
        context,
      } = options;
      const methods = await checkVerificationMethods(scope);
      // 一条方式都没有：只能先去开通，弹窗里没有可选项，直接提示。
      // 有方式但当前都不可用（例如两步验证失败次数过多被锁定）：仍然打开弹窗，
      // 由弹窗逐条列出原因，用户才知道是等一会儿还是去配置。
      if (!methods.methods.length) {
        const message = t(
          '您需要先启用两步验证、Passkey 或配置其他可用的安全验证方式',
        );
        showError(message);
        onError?.(new Error(message));
        return false;
      }
      const method = pickDefaultVerificationMethod(methods, preferredMethod);
      if (preferredMethod && method !== preferredMethod) {
        const reason =
          methods.methods.find((option) => option.method === preferredMethod)
            ?.reason || t('该验证方式当前不可用');
        showWarning(reason);
      }
      setVerificationState((previous) => ({
        ...previous,
        ...emptyVerificationInput(),
        method,
        apiCall,
        scope,
        context,
        title,
        description,
      }));
      setIsModalVisible(true);
      return true;
    },
    [checkVerificationMethods, onError, t],
  );

  const executeVerification = useCallback(
    async (overrides = {}) => {
      if (!verificationState.apiCall) {
        showError(t('验证配置错误'));
        return;
      }
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
          {
            scope: verificationState.scope,
            context: verificationState.context,
          },
          verificationMethods,
        );
        const result = await verificationState.apiCall(
          proof.proof_token,
          proof,
        );
        if (successMessage) showSuccess(successMessage);
        onSuccess?.(result, verificationState.method);
        if (autoReset) resetState();
        return result;
      } catch (error) {
        showError(error.message || t('验证失败，请重试'));
        onError?.(error);
        throw error;
      } finally {
        setVerificationState((previous) => ({ ...previous, loading: false }));
      }
    },
    [
      verificationState,
      verificationMethods,
      successMessage,
      onSuccess,
      onError,
      autoReset,
      resetState,
      t,
    ],
  );

  const setVerificationCode = useCallback((code) => {
    setVerificationState((previous) => ({ ...previous, code }));
  }, []);
  const setVerificationPassword = useCallback((password) => {
    setVerificationState((previous) => ({ ...previous, password }));
  }, []);
  const setVerificationProvider = useCallback((provider) => {
    setVerificationState((previous) => ({ ...previous, provider }));
  }, []);
  const switchVerificationMethod = useCallback((method) => {
    setVerificationState((previous) => ({
      ...previous,
      ...emptyVerificationInput(),
      method,
    }));
  }, []);
  const cancelVerification = useCallback(() => resetState(), [resetState]);
  const canUseMethod = useCallback(
    (method) => verificationMethods.availableMethods.includes(method),
    [verificationMethods],
  );
  const getRecommendedMethod = useCallback(
    () => pickDefaultVerificationMethod(verificationMethods),
    [verificationMethods],
  );
  const withVerification = useCallback(
    async (apiCall, options = {}) => startVerification(apiCall, options),
    [startVerification],
  );

  return {
    isModalVisible,
    verificationMethods,
    verificationState,
    startVerification,
    executeVerification,
    cancelVerification,
    resetState,
    setVerificationCode,
    setVerificationPassword,
    setVerificationProvider,
    switchVerificationMethod,
    checkVerificationMethods,
    canUseMethod,
    getRecommendedMethod,
    withVerification,
    hasAnyVerificationMethod: verificationMethods.availableMethods.length > 0,
    isLoading: verificationState.loading,
    currentMethod: verificationState.method,
    code: verificationState.code,
    password: verificationState.password,
    oauthProviders: verificationMethods.oauthProviders,
  };
};
