import { Button, Input, InputNumber } from '@douyinfe/semi-ui'
import { IconDelete, IconPlus } from '@douyinfe/semi-icons'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

function parseObject(raw) {
  if (!raw || !String(raw).trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function limitText(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : ''
}

export function ModelQuotaOverridesEditor({ value, onChange, disabled }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() =>
    Object.entries(parseObject(value)).map(([model, limits]) => ({
      model,
      daily: limitText(limits?.daily_limit),
      weekly: limitText(limits?.weekly_limit),
      total: limitText(limits?.total_limit),
    }))
  )

  useEffect(() => {
    const incoming = Object.entries(parseObject(value)).map(([model, limits]) => ({
      model,
      daily: limitText(limits?.daily_limit),
      weekly: limitText(limits?.weekly_limit),
      total: limitText(limits?.total_limit),
    }))
    setRows((current) => {
      const currentNamed = current.filter((row) => row.model.trim())
      return JSON.stringify(currentNamed) === JSON.stringify(incoming)
        ? current
        : incoming
    })
  }, [value])

  const commit = (next) => {
    setRows(next)
    const map = {}
    next.forEach((row) => {
      const model = row.model.trim()
      if (!model) return
      const toLimit = (item) => {
        const parsed = Number(item)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
      }
      map[model] = {
        daily_limit: toLimit(row.daily),
        weekly_limit: toLimit(row.weekly),
        total_limit: toLimit(row.total),
      }
    })
    onChange(Object.keys(map).length ? JSON.stringify(map, null, 2) : '')
  }

  return (
    <div className='mb-4 flex flex-col gap-2'>
      <div className='text-sm font-medium'>{t('模型额度覆盖（JSON）')}</div>
      {rows.map((row, index) => (
        <div key={index} className='grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] gap-2'>
          <Input
            value={row.model}
            placeholder={t('模型')}
            disabled={disabled}
            onChange={(next) =>
              commit(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, model: next } : item)))
            }
          />
          <InputNumber
            value={row.daily === '' ? undefined : Number(row.daily)}
            min={0}
            placeholder={t('日额度')}
            disabled={disabled}
            onChange={(next) =>
              commit(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, daily: next ?? '' } : item)))
            }
          />
          <InputNumber
            value={row.weekly === '' ? undefined : Number(row.weekly)}
            min={0}
            placeholder={t('周额度')}
            disabled={disabled}
            onChange={(next) =>
              commit(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, weekly: next ?? '' } : item)))
            }
          />
          <InputNumber
            value={row.total === '' ? undefined : Number(row.total)}
            min={0}
            placeholder={t('总额度')}
            disabled={disabled}
            onChange={(next) =>
              commit(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, total: next ?? '' } : item)))
            }
          />
          <Button
            icon={<IconDelete />}
            type='danger'
            theme='borderless'
            disabled={disabled}
            onClick={() => commit(rows.filter((_, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
      <div>
        <Button
          icon={<IconPlus />}
          disabled={disabled}
          onClick={() => commit([...rows, { model: '', daily: '', weekly: '', total: '' }])}
        >
          {t('添加')}
        </Button>
      </div>
      <div className='text-xs text-tertiary'>
        {t('可选。按模型覆盖上面的渠道级额度，未填写的维度继承渠道级设置')}
      </div>
    </div>
  )
}

export function ModelUpstreamRatiosEditor({ value, onChange, disabled }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() =>
    Object.entries(parseObject(value)).map(([model, ratio]) => ({
      model,
      ratio: Number.isFinite(Number(ratio)) ? String(ratio) : '',
    }))
  )

  useEffect(() => {
    const incoming = Object.entries(parseObject(value)).map(([model, ratio]) => ({
      model,
      ratio: Number.isFinite(Number(ratio)) ? String(ratio) : '',
    }))
    setRows((current) => {
      const currentNamed = current.filter((row) => row.model.trim())
      return JSON.stringify(currentNamed) === JSON.stringify(incoming)
        ? current
        : incoming
    })
  }, [value])

  const commit = (next) => {
    setRows(next)
    const map = {}
    next.forEach((row) => {
      const model = row.model.trim()
      const ratio = Number(row.ratio)
      if (!model || !Number.isFinite(ratio) || ratio < 0) return
      map[model] = ratio
    })
    onChange(Object.keys(map).length ? JSON.stringify(map, null, 2) : '')
  }

  return (
    <div className='mb-4 flex flex-col gap-2'>
      <div className='text-sm font-medium'>{t('模型上游倍率（JSON）')}</div>
      {rows.map((row, index) => (
        <div key={index} className='grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-2'>
          <Input
            value={row.model}
            placeholder={t('模型')}
            disabled={disabled}
            onChange={(next) =>
              commit(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, model: next } : item)))
            }
          />
          <InputNumber
            value={row.ratio === '' ? undefined : Number(row.ratio)}
            min={0}
            step={0.01}
            placeholder={t('上游倍率（渠道默认）')}
            disabled={disabled}
            onChange={(next) =>
              commit(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ratio: next ?? '' } : item)))
            }
          />
          <Button
            icon={<IconDelete />}
            type='danger'
            theme='borderless'
            disabled={disabled}
            onClick={() => commit(rows.filter((_, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
      <div>
        <Button
          icon={<IconPlus />}
          disabled={disabled}
          onClick={() => commit([...rows, { model: '', ratio: '' }])}
        >
          {t('添加')}
        </Button>
      </div>
      <div className='text-xs text-tertiary'>
        {t('可选。按模型覆盖渠道默认上游倍率')}
      </div>
    </div>
  )
}
