/*
Copyright (C) 2023-2026 QuantumNous

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
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    grecaptcha?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => number
      reset: (widgetId?: number) => void
    }
  }
}

interface RecaptchaProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

export function Recaptcha({
  siteKey,
  onVerify,
  onExpire,
  className,
}: RecaptchaProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  // 回调只通过 ref 读取：把它们写进依赖会让父组件每次渲染都多出一个 widget
  const handlersRef = useRef({ onVerify, onExpire })

  useEffect(() => {
    handlersRef.current = { onVerify, onExpire }
  })

  useEffect(() => {
    const render = () => {
      if (!ref.current || !window.grecaptcha) return
      try {
        window.grecaptcha.render(ref.current, {
          sitekey: siteKey,
          theme: document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light',
          callback: (token: string) => handlersRef.current.onVerify(token),
          'expired-callback': () => handlersRef.current.onExpire?.(),
          'error-callback': () => handlersRef.current.onExpire?.(),
        })
      } catch {
        /* empty */
      }
    }

    if (window.grecaptcha) {
      render()
      return
    }
    const scriptId = 'google-recaptcha-api'
    if (document.getElementById(scriptId)) return
    const s = document.createElement('script')
    s.id = scriptId
    s.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => render()
    document.head.appendChild(s)
  }, [siteKey])

  return <div ref={ref} className={className} />
}
