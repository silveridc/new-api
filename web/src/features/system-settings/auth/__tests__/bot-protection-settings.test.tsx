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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance, type i18n } from 'i18next'
import { useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { UpdateOptionRequest } from '../../types'
import { BotProtectionSection } from '../bot-protection-section'

const defaults = {
  TurnstileCheckEnabled: false,
  TurnstileSiteKey: '',
  TurnstileSecretKey: '',
  RecaptchaCheckEnabled: false,
  RecaptchaSiteKey: '',
  RecaptchaSecretKey: '',
}

let testI18n: i18n

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  )

  return (
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={client}>
        <div ref={setContainer} />
        <SettingsPageProvider actionsContainer={container}>
          <BotProtectionSection defaultValues={defaults} />
        </SettingsPageProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
}

async function renderSettings() {
  const route = createRootRoute({ component: Fixture })
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  testI18n = createInstance()
  await testI18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} }, zh },
    interpolation: { escapeValue: false },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

function mockOptionSave() {
  return vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true, message: '' } } as never)
}

function savedKeys(put: Mock) {
  return put.mock.calls.map(([, body]) => (body as UpdateOptionRequest).key)
}

function savedValues(put: Mock) {
  return Object.fromEntries(
    put.mock.calls.map(
      ([, body]) =>
        [
          (body as UpdateOptionRequest).key,
          (body as UpdateOptionRequest).value,
        ] as [string, string | number | boolean]
    )
  )
}

// Turnstile and reCAPTCHA share the 'Site Key' / 'Secret Key' labels and
// render in provider order, so index 0 is Turnstile and index 1 is reCAPTCHA.
function siteKeyInputs() {
  return screen.getAllByRole('textbox', { name: 'Site Key' })
}

function secretKeyInputs() {
  return screen.getAllByLabelText('Secret Key')
}

describe('Bot Protection settings saves', () => {
  it('saves both keys before enabling Turnstile in one save', async () => {
    const put = mockOptionSave()
    const user = userEvent.setup()
    await renderSettings()
    await user.type(siteKeyInputs()[0], 'site-key')
    await user.type(secretKeyInputs()[0], 'secret-key')
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(3))
    expect(savedKeys(put)).toEqual([
      'TurnstileSiteKey',
      'TurnstileSecretKey',
      'TurnstileCheckEnabled',
    ])
    expect(savedValues(put)).toEqual({
      TurnstileSiteKey: 'site-key',
      TurnstileSecretKey: 'secret-key',
      TurnstileCheckEnabled: true,
    })
  })

  it('saves both keys before enabling reCAPTCHA in one save', async () => {
    const put = mockOptionSave()
    const user = userEvent.setup()
    await renderSettings()
    await user.type(siteKeyInputs()[1], 'recaptcha-site')
    await user.type(secretKeyInputs()[1], 'recaptcha-secret')
    await user.click(screen.getByRole('switch', { name: 'Enable reCAPTCHA' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(3))
    expect(savedKeys(put)).toEqual([
      'RecaptchaSiteKey',
      'RecaptchaSecretKey',
      'RecaptchaCheckEnabled',
    ])
    expect(savedValues(put)).toEqual({
      RecaptchaSiteKey: 'recaptcha-site',
      RecaptchaSecretKey: 'recaptcha-secret',
      RecaptchaCheckEnabled: true,
    })
  })

  it('keeps every enable switch behind both providers keys', async () => {
    const put = mockOptionSave()
    const user = userEvent.setup()
    await renderSettings()
    await user.type(siteKeyInputs()[0], 'site-key')
    await user.type(siteKeyInputs()[1], 'recaptcha-site')
    await user.click(screen.getByRole('switch', { name: 'Enable Turnstile' }))
    await user.click(screen.getByRole('switch', { name: 'Enable reCAPTCHA' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(4))
    expect(savedKeys(put)).toEqual([
      'TurnstileSiteKey',
      'RecaptchaSiteKey',
      'TurnstileCheckEnabled',
      'RecaptchaCheckEnabled',
    ])
  })
})
