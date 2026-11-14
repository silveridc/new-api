export type QuotaOverrideRow = {
  model: string
  daily: string
  weekly: string
  total: string
}

export type RatioOverrideRow = {
  model: string
  ratio: string
}

function limitValue(raw: unknown): string {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? String(value) : ''
}

export function parseQuotaOverrideRows(raw: string): QuotaOverrideRow[] {
  if (!raw.trim()) return []
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return Object.entries(parsed).map(([model, value]) => {
    const limits =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
    return {
      model,
      daily: limitValue(limits.daily_limit),
      weekly: limitValue(limits.weekly_limit),
      total: limitValue(limits.total_limit),
    }
  })
}

export function serializeQuotaOverrideRows(rows: QuotaOverrideRow[]): string {
  const map: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const model = row.model.trim()
    if (!model) continue
    const toLimit = (value: string) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
    map[model] = {
      daily_limit: toLimit(row.daily),
      weekly_limit: toLimit(row.weekly),
      total_limit: toLimit(row.total),
    }
  }
  return Object.keys(map).length === 0 ? '' : JSON.stringify(map, null, 2)
}

export function parseRatioOverrideRows(raw: string): RatioOverrideRow[] {
  if (!raw.trim()) return []
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return Object.entries(parsed).map(([model, value]) => ({
    model,
    ratio: Number.isFinite(Number(value)) ? String(value) : '',
  }))
}

export function serializeRatioOverrideRows(rows: RatioOverrideRow[]): string {
  const map: Record<string, number> = {}
  for (const row of rows) {
    const model = row.model.trim()
    const ratio = Number(row.ratio)
    if (!model || !Number.isFinite(ratio) || ratio < 0) continue
    map[model] = ratio
  }
  return Object.keys(map).length === 0 ? '' : JSON.stringify(map, null, 2)
}
