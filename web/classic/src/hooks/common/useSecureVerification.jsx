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

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SecureVerificationService } from '../../services/secureVerification';
import { showError, showSuccess } from '../../helpers';

export const useSecureVerification = ({
  onSuccess,
  onError,
  successMessage,
  autoReset = true,
} = {}) => {
  const { t } = useTranslation();
  const [verificationMethods, setVerificationMethods] = useState({
    has2FA: false,
    hasPasskey: false,
    passkeySupported: false,
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [verificationState, setVerificationState] = useState({
    method: null,
    loading: false,
    code: '',
    apiCall: null,
    scope: 'channel.key.read',
    context: undefined,
  });

  const checkVerificationMethods = useCallback(async (scope = 'channel.key.read') => {
    const methods = await SecureVerificationService.checkAvailableVerificationMethods(scope);
    setVerificationMethods(methods);
    return methods;
  }, []);

  useEffect(() => {
    void checkVerificationMethods();
  }, [checkVerificationMethods]);

  const resetState = useCallback(() => {
    setVerificationState({
      method: null,
      loading: false,
      code: '',
      apiCall: null,
      scope: 'channel.key.read',
      context: undefined,
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
      if (!methods.has2FA && !methods.hasPasskey) {
        const message = t('您需要先启用两步验证或 Passkey 才能执行此操作');
        showError(message);
        onError?.(new Error(message));
        return false;
      }
      let method = preferredMethod;
      if (method === 'passkey' && (!methods.hasPasskey || !methods.passkeySupported)) {
        method = methods.has2FA ? '2fa' : null;
      }
      if (!method) method = methods.hasPasskey && methods.passkeySupported ? 'passkey' : '2fa';
      setVerificationState((previous) => ({
        ...previous,
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
    async (method, code = '') => {
      if (!verificationState.apiCall) {
        showError(t('验证配置错误'));
        return;
      }
      setVerificationState((previous) => ({ ...previous, loading: true }));
      try {
        const proof = await SecureVerificationService.verify(method, code, {
          scope: verificationState.scope,
          context: verificationState.context,
        });
        const result = await verificationState.apiCall(proof.proof_token, proof);
        if (successMessage) showSuccess(successMessage);
        onSuccess?.(result, method);
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
    [verificationState, successMessage, onSuccess, onError, autoReset, resetState, t],
  );

  const setVerificationCode = useCallback((code) => {
    setVerificationState((previous) => ({ ...previous, code }));
  }, []);
  const switchVerificationMethod = useCallback((method) => {
    setVerificationState((previous) => ({ ...previous, method, code: '' }));
  }, []);
  const cancelVerification = useCallback(() => resetState(), [resetState]);
  const canUseMethod = useCallback(
    (method) => method === '2fa' ? verificationMethods.has2FA : method === 'passkey' && verificationMethods.hasPasskey && verificationMethods.passkeySupported,
    [verificationMethods],
  );
  const getRecommendedMethod = useCallback(
    () => verificationMethods.hasPasskey && verificationMethods.passkeySupported ? 'passkey' : verificationMethods.has2FA ? '2fa' : null,
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
    switchVerificationMethod,
    checkVerificationMethods,
    canUseMethod,
    getRecommendedMethod,
    withVerification,
    hasAnyVerificationMethod: verificationMethods.has2FA || verificationMethods.hasPasskey,
    isLoading: verificationState.loading,
    currentMethod: verificationState.method,
    code: verificationState.code,
  };
};
