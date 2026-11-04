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

import React, { useEffect, useRef } from 'react';

const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-api';
const RECAPTCHA_SCRIPT_SRC =
  'https://www.google.com/recaptcha/api.js?render=explicit';

const Recaptcha = ({ siteKey, onVerify, onExpire, className }) => {
  const containerRef = useRef(null);
  // 回调放进 ref：父组件每次渲染都会传入新的箭头函数，若把它们列为依赖
  // 会在每次渲染时重复 render 一个 widget，页面上就会出现多个复选框。
  const handlersRef = useRef({ onVerify, onExpire });

  useEffect(() => {
    handlersRef.current = { onVerify, onExpire };
  });

  useEffect(() => {
    const renderWidget = () => {
      const api = window.grecaptcha;
      if (!api || typeof api.render !== 'function' || !containerRef.current) {
        return;
      }
      api.render(containerRef.current, {
        sitekey: siteKey,
        theme: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
        callback: (token) => handlersRef.current.onVerify?.(token),
        'expired-callback': () => handlersRef.current.onExpire?.(),
        'error-callback': () => handlersRef.current.onExpire?.(),
      });
    };

    if (window.grecaptcha) {
      renderWidget();
      return;
    }
    if (document.getElementById(RECAPTCHA_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = RECAPTCHA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => renderWidget();
    document.head.appendChild(script);
  }, [siteKey]);

  return <div ref={containerRef} className={className} />;
};

export default Recaptcha;
