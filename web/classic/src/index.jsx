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
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@douyinfe/semi-ui/dist/css/semi.css';
import { UserProvider } from './context/User';
import 'react-toastify/dist/ReactToastify.css';
import { StatusProvider } from './context/Status';
import { ThemeProvider } from './context/Theme';
import PageLayout from './components/layout/PageLayout';
import SecureVerificationProvider from './components/common/SecureVerificationProvider';
import './i18n/i18n';
import './index.css';
import { LocaleProvider } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import zh_CN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import en_GB from '@douyinfe/semi-ui/lib/es/locale/source/en_GB';
import * as Sentry from "@sentry/react";

/*Sentry.init({
  dsn: "https://163f8d10caa2f8ae225919cd8daebaa5@sentry.silveridc.cn/12",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    //Sentry.replayIntegration()
  ],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true
});*/
// zhaoyj add:前端白屏，添加sentry
Sentry.init({
  dsn: "https://163f8d10caa2f8ae225919cd8daebaa5@sentry.silveridc.cn/12",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    //Sentry.replayIntegration()
  ],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  /*replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,*/
  enableLogs: true,

  beforeSend(event, hint) {
    const error = hint.originalException;

    // 1. 拦截 Axios 抛出的 401 错误
    if (error && error.isAxiosError && error.response?.status === 401) {
      return null; // 返回 null 意味着不上报该错误
    }

    // 2. 补充防范：某些情况下 status 挂在根对象或 response 上
    if (error?.status === 401 || error?.statusCode === 401) {
      return null;
    }

    return event;
  },
});

// 欢迎信息（二次开发者未经允许不准将此移除）
// Welcome message (Do not remove this without permission from the original developer)
if (typeof window !== 'undefined') {
  console.log(
    '%cWE ❤ NEWAPI%c Github: https://github.com/QuantumNous/new-api',
    'color: #10b981; font-weight: bold; font-size: 24px;',
    'color: inherit; font-size: 14px;',
  );
}

function SemiLocaleWrapper({ children }) {
  const { i18n } = useTranslation();
  const semiLocale = React.useMemo(
    () => ({ zh: zh_CN, en: en_GB })[i18n.language] || zh_CN,
    [i18n.language],
  );
  return <LocaleProvider locale={semiLocale}>{children}</LocaleProvider>;
}

// initialization

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <StatusProvider>
      <UserProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <ThemeProvider>
            <SemiLocaleWrapper>
              <SecureVerificationProvider>
                <PageLayout />
              </SecureVerificationProvider>
            </SemiLocaleWrapper>
          </ThemeProvider>
        </BrowserRouter>
      </UserProvider>
    </StatusProvider>
  </React.StrictMode>,
);
