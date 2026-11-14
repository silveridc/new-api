import { describe, expect, test } from 'vitest'

import {
  parseQuotaOverrideRows,
  parseRatioOverrideRows,
  serializeQuotaOverrideRows,
  serializeRatioOverrideRows,
} from '../model-override-editors'

describe('model override visual editors', () => {
  test('quota rows round-trip the JSON object the form already saves', () => {
    const raw = JSON.stringify({
      'gpt-4o': { daily_limit: 10, weekly_limit: 0, total_limit: 20 },
    })

    expect(serializeQuotaOverrideRows(parseQuotaOverrideRows(raw))).toBe(
      JSON.stringify(
        { 'gpt-4o': { daily_limit: 10, weekly_limit: 0, total_limit: 20 } },
        null,
        2
      )
    )
  })

  test('ratio rows omit blank models and keep numeric multipliers', () => {
    expect(
      serializeRatioOverrideRows([
        { model: ' gpt-4o ', ratio: '0.8' },
        { model: '', ratio: '1' },
      ])
    ).toBe(JSON.stringify({ 'gpt-4o': 0.8 }, null, 2))
    expect(parseRatioOverrideRows('{"claude":1.5}')).toEqual([
      { model: 'claude', ratio: '1.5' },
    ])
  })
})
