import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  parseQuotaOverrideRows,
  parseRatioOverrideRows,
  serializeQuotaOverrideRows,
  serializeRatioOverrideRows,
  type QuotaOverrideRow,
  type RatioOverrideRow,
} from '../lib/model-override-editors'

type EditorProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  models?: string[]
}

function useSyncedRows<T>(value: string, parse: (raw: string) => T[]) {
  const [rows, setRows] = useState<T[]>(() => {
    try {
      return parse(value)
    } catch {
      return []
    }
  })
  const [source, setSource] = useState(value)

  useEffect(() => {
    if (value === source) return
    setSource(value)
    try {
      setRows(parse(value))
    } catch {
      setRows([])
    }
  }, [parse, source, value])

  return [rows, setRows] as const
}

export function ModelQuotaOverridesEditor(props: EditorProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useSyncedRows(props.value, parseQuotaOverrideRows)

  const commit = (next: QuotaOverrideRow[]) => {
    setRows(next)
    props.onChange(serializeQuotaOverrideRows(next))
  }

  return (
    <div className='space-y-2'>
      {rows.map((row, index) => (
        <div
          key={index}
          className='grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]'
        >
          <Input
            value={row.model}
            list='channel-model-override-options'
            placeholder={t('Model')}
            disabled={props.disabled}
            onChange={(event) =>
              commit(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, model: event.target.value }
                    : item
                )
              )
            }
          />
          <Input
            type='number'
            min={0}
            step='0.01'
            value={row.daily}
            placeholder={t('Daily limit (USD)')}
            aria-label={t('Daily limit (USD)')}
            disabled={props.disabled}
            onChange={(event) =>
              commit(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, daily: event.target.value }
                    : item
                )
              )
            }
          />
          <Input
            type='number'
            min={0}
            step='0.01'
            value={row.weekly}
            placeholder={t('Weekly limit (USD)')}
            aria-label={t('Weekly limit (USD)')}
            disabled={props.disabled}
            onChange={(event) =>
              commit(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, weekly: event.target.value }
                    : item
                )
              )
            }
          />
          <Input
            type='number'
            min={0}
            step='0.01'
            value={row.total}
            placeholder={t('Total limit (USD)')}
            aria-label={t('Total limit (USD)')}
            disabled={props.disabled}
            onChange={(event) =>
              commit(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, total: event.target.value }
                    : item
                )
              )
            }
          />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={t('Remove')}
            disabled={props.disabled}
            onClick={() =>
              commit(rows.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2 className='h-4 w-4' aria-hidden='true' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={props.disabled}
        onClick={() =>
          commit([...rows, { model: '', daily: '', weekly: '', total: '' }])
        }
      >
        <Plus className='mr-2 h-4 w-4' aria-hidden='true' />
        {t('Add model')}
      </Button>
      <datalist id='channel-model-override-options'>
        {(props.models ?? []).map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
    </div>
  )
}

export function ModelUpstreamRatiosEditor(props: EditorProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useSyncedRows(props.value, parseRatioOverrideRows)

  const commit = (next: RatioOverrideRow[]) => {
    setRows(next)
    props.onChange(serializeRatioOverrideRows(next))
  }

  return (
    <div className='space-y-2'>
      {rows.map((row, index) => (
        <div
          key={index}
          className='grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]'
        >
          <Input
            value={row.model}
            list='channel-model-override-options'
            placeholder={t('Model')}
            disabled={props.disabled}
            onChange={(event) =>
              commit(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, model: event.target.value }
                    : item
                )
              )
            }
          />
          <Input
            type='number'
            min={0}
            step='0.01'
            value={row.ratio}
            placeholder={t('Upstream ratio (channel default)')}
            aria-label={t('Upstream ratio (channel default)')}
            disabled={props.disabled}
            onChange={(event) =>
              commit(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, ratio: event.target.value }
                    : item
                )
              )
            }
          />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={t('Remove')}
            disabled={props.disabled}
            onClick={() =>
              commit(rows.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2 className='h-4 w-4' aria-hidden='true' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={props.disabled}
        onClick={() => commit([...rows, { model: '', ratio: '' }])}
      >
        <Plus className='mr-2 h-4 w-4' aria-hidden='true' />
        {t('Add model')}
      </Button>
    </div>
  )
}
