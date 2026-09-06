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
// zhaoyj add: Sentry 前端错误监控
import { init, tanstackRouterBrowserTracingIntegration } from '@sentry/react'

export let sentryInitialized = false

const dsn =
  typeof import.meta.env.VITE_SENTRY_DSN === 'string'
    ? import.meta.env.VITE_SENTRY_DSN
    : ''

// router passes through as any — matches @sentry/react's own tanstackRouterBrowserTracingIntegration
export function initSentry(router?: unknown): void {
  if (!dsn) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        'VITE_SENTRY_DSN is not set, skipping Sentry initialization'
      )
    }
    sentryInitialized = false
    return
  }

  const integrations = router
    ? [tanstackRouterBrowserTracingIntegration(router)]
    : []

  init({
    dsn,
    environment: import.meta.env.MODE,
    release: `new-api@${import.meta.env.VITE_REACT_APP_VERSION || ''}`,
    integrations,
    tracesSampleRate: 1.0,
  })
  sentryInitialized = true
}