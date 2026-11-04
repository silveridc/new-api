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
import { describe, expect, test } from 'vitest'

import { channelSchema } from '../../types'
import {
  channelFormSchema,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
} from '../channel-form'

const MODEL_USAGE = {
  daily_used: 3.5,
  daily_start: 1700000000,
  weekly_used: 7,
  weekly_start: 1699000000,
  total_used: 42,
}

function storedChannel(modelQuotas: unknown[], quota: Record<string, unknown>) {
  const settings = JSON.stringify({ quota, model_quotas: modelQuotas })
  return channelSchema.parse({
    id: 7,
    name: 'Quota channel',
    type: 1,
    key: '',
    settings,
    other: '',
    remark: '',
    status: 1,
    created_time: 1,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
  })
}

function settingsOf(form: ReturnType<typeof transformChannelToFormDefaults>) {
  return JSON.parse(
    transformFormDataToCreatePayload(form).channel.settings ?? '{}'
  )
}

describe('channel quota model overrides', () => {
  test('re-saving a channel keeps the backend-accumulated usage and the gate enabled', () => {
    const channel = storedChannel(
      [
        {
          model: 'gpt-4o',
          enabled: true,
          daily_limit: 10,
          weekly_limit: 20,
          total_limit: 100,
          ...MODEL_USAGE,
          daily_reset_mode: 'fixed',
          daily_reset_hour: 4,
          reset_timezone: 'Asia/Shanghai',
        },
      ],
      { enabled: true, total_limit: 500, ...MODEL_USAGE, total_used: 120 }
    )
    const form = transformChannelToFormDefaults(channel)

    expect(JSON.parse(form.quota_model_overrides ?? '')).toEqual({
      'gpt-4o': { daily_limit: 10, weekly_limit: 20, total_limit: 100 },
    })

    const settings = settingsOf(form)
    expect(settings.model_quotas).toEqual([
      {
        model: 'gpt-4o',
        enabled: true,
        daily_limit: 10,
        weekly_limit: 20,
        total_limit: 100,
        ...MODEL_USAGE,
        daily_reset_mode: 'fixed',
        daily_reset_hour: 4,
        reset_timezone: 'Asia/Shanghai',
      },
    ])
    expect(settings.quota).toMatchObject({ enabled: true, total_limit: 500 })
    expect(settings.quota.total_used).toBe(120)
  })

  test('listing a model turns its gate on and drops models removed from the text', () => {
    const channel = storedChannel(
      [
        {
          model: 'gpt-4o',
          enabled: true,
          daily_limit: 10,
          weekly_limit: 0,
          total_limit: 0,
          ...MODEL_USAGE,
        },
      ],
      { enabled: true }
    )
    const form = {
      ...transformChannelToFormDefaults(channel),
      quota_model_overrides: JSON.stringify({
        'gpt-4o': { daily_limit: 0, weekly_limit: 6, total_limit: 0 },
        'claude-sonnet': { daily_limit: 0, weekly_limit: 0, total_limit: 9 },
      }),
    }

    expect(settingsOf(form).model_quotas).toEqual([
      {
        model: 'gpt-4o',
        enabled: true,
        daily_limit: 0,
        weekly_limit: 6,
        total_limit: 0,
        ...MODEL_USAGE,
      },
      {
        model: 'claude-sonnet',
        enabled: true,
        daily_limit: 0,
        weekly_limit: 0,
        total_limit: 9,
      },
    ])
  })

  test('an empty text clears the overrides and junk values are rejected', () => {
    const channel = storedChannel(
      [{ model: 'gpt-4o', enabled: true, daily_limit: 10, ...MODEL_USAGE }],
      { enabled: true }
    )
    const base = transformChannelToFormDefaults(channel)

    expect(
      settingsOf({ ...base, quota_model_overrides: '  ' }).model_quotas
    ).toEqual([])

    const errorPaths = (values: Record<string, unknown>) =>
      channelFormSchema
        .safeParse(values)
        .error?.issues.map((issue) => String(issue.path[0])) ?? []

    expect(
      errorPaths({ ...base, quota_model_overrides: '{"gpt-4o": 3}' })
    ).toContain('quota_model_overrides')
    expect(
      errorPaths({ ...base, quota_model_overrides: 'not json' })
    ).toContain('quota_model_overrides')
    expect(
      errorPaths({ ...base, quota_model_overrides: '{"gpt-4o": {}}' })
    ).not.toContain('quota_model_overrides')
    expect(
      errorPaths({ ...base, upstream_model_ratios: '{"gpt-4o": "fast"}' })
    ).toContain('upstream_model_ratios')
  })
})
