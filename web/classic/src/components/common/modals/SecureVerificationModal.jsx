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

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  Input,
  Typography,
  Tabs,
  TabPane,
  Space,
} from '@douyinfe/semi-ui';

/**
 * 通用安全验证模态框组件
 * 配合 useSecureVerification Hook 或 SecureVerificationProvider 使用。
 * 页签来自服务端返回的验证方式列表：不可用的方式保留并展示原因，
 * 与 web 控制台的 SecureVerificationDialog 行为一致。
 * @param {Object} props
 * @param {boolean} props.visible - 是否显示模态框
 * @param {Object} props.verificationMethods - summarizeRequirements 的结果
 * @param {Object} props.verificationState - 当前验证状态（方式 + 各类输入）
 * @param {Function} props.onVerify - 验证回调，可传 {provider} 覆盖输入
 * @param {Function} props.onCancel - 取消回调
 * @param {Function} props.onCodeChange - 验证码变化回调
 * @param {Function} props.onPasswordChange - 密码变化回调
 * @param {Function} props.onMethodSwitch - 验证方式切换回调
 * @param {string} props.title - 模态框标题
 * @param {string} props.description - 验证描述文本
 */
const SecureVerificationModal = ({
  visible,
  verificationMethods,
  verificationState,
  onVerify,
  onCancel,
  onCodeChange,
  onPasswordChange,
  onMethodSwitch,
  title,
  description,
}) => {
  const { t } = useTranslation();

  const options = verificationMethods.methods || [];
  const oauthProviders = verificationMethods.oauthProviders || [];
  const { method, loading, code, password } = verificationState;

  const methodLabel = (key) => {
    switch (key) {
      case '2fa':
        return t('两步验证');
      case 'passkey':
        return t('Passkey');
      case 'password':
        return t('密码');
      case 'oauth':
        return t('已绑定账号');
      default:
        return key;
    }
  };

  // executeVerification 失败时会 re-throw 让调用方知道结果，但这里只是按钮/回车回调，
  // 不接住就会在控制台留下未处理的 promise rejection（错误提示 hook 已经弹过 toast）。
  const submit = (overrides) => {
    Promise.resolve(onVerify(overrides)).catch(() => undefined);
  };

  const handleKeyDown = (e) => {
    if (
      e.key === 'Enter' &&
      !loading &&
      ((method === '2fa' && code.trim()) || (method === 'password' && password))
    ) {
      submit();
    }
    if (e.key === 'Escape' && !loading) {
      onCancel();
    }
  };

  const footer = (canSubmit) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      <Button onClick={onCancel} disabled={loading}>
        {t('取消')}
      </Button>
      <Button
        theme='solid'
        type='primary'
        loading={loading}
        disabled={!canSubmit || loading}
        onClick={() => submit()}
      >
        {t('验证')}
      </Button>
    </div>
  );

  // 没有任何可用方式：把服务端与设备端的原因逐条列出，用户才知道去哪儿配置。
  if (visible && options.every((option) => !option.available)) {
    return (
      <Modal
        title={title || t('安全验证')}
        visible={visible}
        onCancel={onCancel}
        footer={<Button onClick={onCancel}>{t('确定')}</Button>}
        width={500}
        style={{ maxWidth: '90vw' }}
      >
        <div className='text-center py-6'>
          <div className='mb-4'>
            <svg
              className='w-16 h-16 text-yellow-500 mx-auto mb-4'
              fill='currentColor'
              viewBox='0 0 20 20'
            >
              <path
                fillRule='evenodd'
                d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
                clipRule='evenodd'
              />
            </svg>
          </div>
          <Typography.Title heading={4} className='mb-2'>
            {t('需要安全验证')}
          </Typography.Title>
          <Typography.Text type='tertiary'>
            {t('当前没有可用于该操作的验证方式。')}
          </Typography.Text>
          <div style={{ marginTop: 12, textAlign: 'left' }}>
            {options.map((option) => (
              <Typography.Text
                key={option.method}
                type='tertiary'
                size='small'
                style={{ display: 'block' }}
              >
                {methodLabel(option.method)}
                {option.reason ? `：${option.reason}` : ''}
              </Typography.Text>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={title || t('安全验证')}
      visible={visible}
      onCancel={loading ? undefined : onCancel}
      closeOnEsc={!loading}
      footer={null}
      width={460}
      centered
      style={{
        maxWidth: 'calc(100vw - 32px)',
      }}
      bodyStyle={{
        padding: '20px 24px',
      }}
    >
      <div style={{ width: '100%' }}>
        {/* 描述信息 */}
        {description && (
          <Typography.Paragraph
            type='tertiary'
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              lineHeight: '1.6',
            }}
          >
            {description}
          </Typography.Paragraph>
        )}

        {/* 验证方式选择 */}
        <Tabs
          activeKey={method}
          onChange={onMethodSwitch}
          type='line'
          style={{ margin: 0 }}
        >
          {options.map((option) => (
            <TabPane
              key={option.method}
              tab={methodLabel(option.method)}
              itemKey={option.method}
              disabled={!option.available}
            >
              {option.method === '2fa' && (
                <div style={{ paddingTop: '20px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <Input
                      placeholder={t('请输入6位验证码或8位备用码')}
                      value={code}
                      onChange={onCodeChange}
                      size='large'
                      maxLength={9}
                      onKeyDown={handleKeyDown}
                      autoFocus={method === '2fa'}
                      disabled={loading}
                      prefix={
                        <svg
                          style={{
                            width: 16,
                            height: 16,
                            marginRight: 8,
                            flexShrink: 0,
                          }}
                          fill='currentColor'
                          viewBox='0 0 20 20'
                        >
                          <path
                            fillRule='evenodd'
                            d='M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z'
                            clipRule='evenodd'
                          />
                        </svg>
                      }
                      style={{ width: '100%' }}
                    />
                  </div>

                  <Typography.Text
                    type='tertiary'
                    size='small'
                    style={{
                      display: 'block',
                      marginBottom: '20px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                    }}
                  >
                    {t('从认证器应用中获取验证码，或使用备用码')}
                  </Typography.Text>

                  {footer(Boolean(code && code.trim()))}
                </div>
              )}

              {option.method === 'passkey' && (
                <div style={{ paddingTop: '20px' }}>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '24px 16px',
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        margin: '0 auto 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        background: 'var(--semi-color-primary-light-default)',
                      }}
                    >
                      <svg
                        style={{
                          width: 28,
                          height: 28,
                          color: 'var(--semi-color-primary)',
                        }}
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z'
                          clipRule='evenodd'
                        />
                      </svg>
                    </div>
                    <Typography.Title
                      heading={5}
                      style={{ margin: '0 0 8px', fontSize: '16px' }}
                    >
                      {t('使用 Passkey 验证')}
                    </Typography.Title>
                    <Typography.Text
                      type='tertiary'
                      style={{
                        display: 'block',
                        margin: 0,
                        fontSize: '13px',
                        lineHeight: '1.5',
                      }}
                    >
                      {t('点击验证按钮，使用您的生物特征或安全密钥')}
                    </Typography.Text>
                  </div>

                  {footer(true)}
                </div>
              )}

              {option.method === 'password' && (
                <div style={{ paddingTop: '20px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <Input
                      mode='password'
                      placeholder={t('请输入账号密码')}
                      value={password}
                      onChange={onPasswordChange}
                      size='large'
                      autoComplete='current-password'
                      onKeyDown={handleKeyDown}
                      autoFocus={method === 'password'}
                      disabled={loading}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <Typography.Text
                    type='tertiary'
                    size='small'
                    style={{
                      display: 'block',
                      marginBottom: '20px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                    }}
                  >
                    {t('输入当前账号的登录密码以确认身份')}
                  </Typography.Text>

                  {footer(Boolean(password))}
                </div>
              )}

              {option.method === 'oauth' && (
                <div style={{ paddingTop: '20px' }}>
                  <Typography.Text
                    type='tertiary'
                    size='small'
                    style={{
                      display: 'block',
                      marginBottom: '16px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                    }}
                  >
                    {t('使用已绑定到本账号的第三方身份完成验证')}
                  </Typography.Text>

                  <Space spacing={8} wrap style={{ marginBottom: '20px' }}>
                    {oauthProviders.map((provider) => (
                      <Button
                        key={provider.slug}
                        type='tertiary'
                        theme='light'
                        disabled={loading}
                        loading={
                          loading &&
                          method === 'oauth' &&
                          (verificationState.provider ||
                            oauthProviders[0]?.slug) === provider.slug
                        }
                        onClick={() => submit({ provider: provider.slug })}
                      >
                        {t('使用 {{name}} 验证', { name: provider.name })}
                      </Button>
                    ))}
                  </Space>

                  <Typography.Text
                    type='tertiary'
                    size='small'
                    style={{ display: 'block', fontSize: '12px' }}
                  >
                    {t('将在新窗口中完成授权，请勿拦截浏览器弹窗。')}
                  </Typography.Text>
                </div>
              )}
            </TabPane>
          ))}
        </Tabs>
      </div>
    </Modal>
  );
};

export default SecureVerificationModal;
