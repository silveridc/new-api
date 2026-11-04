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
import i18next from 'i18next'
import { useState } from 'react'
import { toast } from 'sonner'

import { useStatus } from '@/hooks/use-status'

/**
 * Hook for managing Google reCAPTCHA verification
 */
export function useRecaptcha() {
  const { status } = useStatus()
  const [recaptchaToken, setRecaptchaToken] = useState('')

  const isRecaptchaEnabled = !!(
    status?.recaptcha_check && status?.recaptcha_site_key
  )
  const recaptchaSiteKey = status?.recaptcha_site_key || ''

  /**
   * Validate if recaptcha is ready when required
   */
  const validateRecaptcha = (): boolean => {
    if (isRecaptchaEnabled && !recaptchaToken) {
      toast.info(
        i18next.t('Please wait a moment, human check is initializing...')
      )
      return false
    }
    return true
  }

  return {
    isRecaptchaEnabled,
    recaptchaSiteKey,
    recaptchaToken,
    setRecaptchaToken,
    validateRecaptcha,
  }
}
