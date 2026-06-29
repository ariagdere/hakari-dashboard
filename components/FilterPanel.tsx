'use client'
// components/FilterPanel.tsx
// Tek kaynak: RangeRow, ToggleGroup, FilterPanel
// Yeni filtre alanı eklerken bu dosyayı ve lib/filters.ts'i düzenle.

import React from 'react'
import { Filters } from '@/lib/filters'

function RangeRow({ label, minKey, maxKey, min, max, step = 1, filters, onChange }: {
  label: string; minKey: keyof Filters; maxKey: keyof Filters
  min: number; max: number; step?: number
  filters: Filters; onChange: (f: Filters) => void
}) {
  const [localMin, setLocalMin] = React.useState<number>(filters[minKey] as number)
  const [localMax, setLocalMax] = React.useState<number>(filters[maxKey] as number)
  React.useEffect(() => { setLocalMin(filters[minKey] as number) }, [filters[minKey]])
  React.useEffect(() => { setLocalMax(filters[maxKey] as number) }, [filters[maxKey]])
  const set = (k: keyof Filters, v: any) => onChange({ ...filters, [k]: v })
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="col-label" style={{ fontSize: 10 }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text)' }}>{localMin} – {localMax}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', width: 20 }}>min</span>
        <input type="range" min={min} max={max} step={step} value={localMin}
          onChange={e => setLocalMin(Number(e.target.value))}
          onMouseUp={e => set(minKey, Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => set(minKey, Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1, cursor: 'pointer' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 32, textAlign: 'right' }}>{localMin}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', width: 20 }}>max</span>
        <input type="range" min={min} max={max} step={step} value={localMax}
          onChange={e => setLocalMax(Number(e.target.value))}
          onMouseUp={e => set(maxKey, Number((e.target as HTMLInputElement).value))}
          onTouchEnd={e => set(maxKey, Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1, cursor: 'pointer' }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 32, textAlign: 'right' }}>{localMax}</span>
      </div>
    </div>
  )
}

function ToggleGroup({ label, field, options, filters, onChange, nowrap }: {
  label: string; field: keyof Filters; options: string[]
  filters: Filters; onChange: (f: Filters) => void
  nowrap?: boolean
}) {
  const set = (k: keyof Filters, v: any) => onChange({ ...filters, [k]: v })
  return (
    <div>
      <div className="col-label" style={{ marginBottom: 5, fontSize: 10 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: nowrap ? 'nowrap' : 'wrap' }}>
        <button className={`filter-btn${!filters[field] ? ' active' : ''}`} style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => set(field, '')}>ALL</button>
        {options.map(o => (
          <button key={o} className={`filter-btn${filters[field] === o ? ' active' : ''}`}
            style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={() => set(field, filters[field] === o ? '' : o)}>
            {o.replace('_pressure', '').replace('_HIT', '').replace('NO_ENTRY', 'N/E')}
          </button>
        ))}
      </div>
    </div>
  )
}

export function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const sep = <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0' }} />
  const GL = ({ c }: { c: string }) => (
    <div className="col-label" style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 8 }}>{c}</div>
  )
  const so = { str: ['strong', 'mixed', 'weak'], pres: ['buying_pressure', 'selling_pressure', 'neutral'] }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 600 }}>
      <GL c="FILTERS" />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 14 }}>
        <ToggleGroup label="Direction" field="direction" options={['LONG','SHORT','WAIT']} filters={filters} onChange={onChange} />
        <ToggleGroup label="RESULT" field="sim_result" options={['TP_HIT','SL_HIT','EXPIRED','NO_ENTRY']} filters={filters} onChange={onChange} nowrap />
        <div>
          <div className="col-label" style={{ marginBottom: 5, fontSize: 10 }}>DATE RANGE</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={filters.date_from} onChange={e => onChange({ ...filters, date_from: e.target.value })}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>–</span>
            <input type="date" value={filters.date_to} onChange={e => onChange({ ...filters, date_to: e.target.value })}
              style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 10, padding: '3px 6px', fontFamily: 'DM Mono, monospace' }} />
            {([
              { dow: 1, label: 'M' }, { dow: 2, label: 'T' }, { dow: 3, label: 'W' },
              { dow: 4, label: 'T' }, { dow: 5, label: 'F' }, { dow: 6, label: 'S' }, { dow: 0, label: 'S' },
            ]).map(({ dow, label }) => {
              const active = filters.days.includes(dow)
              return (
                <button key={dow} className={`filter-btn${active ? ' active' : ''}`}
                  style={{ fontSize: 10, padding: '2px 7px', flexShrink: 0, minWidth: 24 }}
                  onClick={() => {
                    const next = active ? filters.days.filter(d => d !== dow) : [...filters.days, dow]
                    if (next.length === 0) return
                    onChange({ ...filters, days: next })
                  }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {sep}
      <GL c="Win Probability — V6" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <RangeRow label="V6" minKey="wp6_min" maxKey="wp6_max" min={0} max={100} step={5} filters={filters} onChange={onChange} />
        <RangeRow label="V6 Rev" minKey="wp6_rev_min" maxKey="wp6_rev_max" min={0} max={100} step={5} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Liquidity Cluster" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div className="col-label" style={{ marginBottom: 6, fontSize: 10 }}>LIQ ZONE</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {([
              'dn_very_dominant','dn_dominant','dn_slight',
              'neutral',
              'up_slight','up_dominant','up_very_dominant',
            ] as const).map(zone => {
              const active = filters.liq_zone.split(',').filter(Boolean).includes(zone)
              return (
                <button
                  key={zone}
                  className={`filter-btn${active ? ' active' : ''}`}
                  style={{ fontSize: 10, padding: '2px 8px' }}
                  onClick={() => {
                    const current = filters.liq_zone.split(',').filter(Boolean)
                    const next = active
                      ? current.filter(z => z !== zone)
                      : [...current, zone]
                    onChange({ ...filters, liq_zone: next.join(',') })
                  }}
                >
                  {zone.replace(/_/g, ' ')}
                </button>
              )
            })}
            {filters.liq_zone && (
              <button
                className="filter-btn"
                style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text-3)' }}
                onClick={() => onChange({ ...filters, liq_zone: '' })}
              >
                clear
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <ToggleGroup label="Up Hit" field="cluster_up_hit" options={['true','false']} filters={filters} onChange={onChange} />
          <ToggleGroup label="Dn Hit" field="cluster_dn_hit" options={['true','false']} filters={filters} onChange={onChange} />
        </div>
      </div>

      {sep}
      <GL c="RSI" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        <RangeRow label="RSI 4H" minKey="rsi_min" maxKey="rsi_max" min={0} max={100} filters={filters} onChange={onChange} />
        <RangeRow label="RSI 30M" minKey="rsi30_min" maxKey="rsi30_max" min={0} max={100} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Delta — H1" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <RangeRow label="LS delta" minKey="h1_ls_delta_min" maxKey="h1_ls_delta_max" min={-3} max={3} step={0.1} filters={filters} onChange={onChange} />
        <RangeRow label="TT Positions delta" minKey="h1_tt_positions_delta_min" maxKey="h1_tt_positions_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="TT Accounts delta" minKey="h1_tt_accounts_delta_min" maxKey="h1_tt_accounts_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="OI delta (BTC)" minKey="h1_oi_delta_min" maxKey="h1_oi_delta_max" min={-20000} max={20000} step={500} filters={filters} onChange={onChange} />
        <RangeRow label="OI/MCap delta" minKey="h1_oi_mcap_delta_min" maxKey="h1_oi_mcap_delta_max" min={-0.05} max={0.05} step={0.005} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Delta — M5" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <RangeRow label="LS delta" minKey="m5_ls_delta_min" maxKey="m5_ls_delta_max" min={-3} max={3} step={0.1} filters={filters} onChange={onChange} />
        <RangeRow label="TT Positions delta" minKey="m5_tt_positions_delta_min" maxKey="m5_tt_positions_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="TT Accounts delta" minKey="m5_tt_accounts_delta_min" maxKey="m5_tt_accounts_delta_max" min={-1} max={1} step={0.05} filters={filters} onChange={onChange} />
        <RangeRow label="OI delta (BTC)" minKey="m5_oi_delta_min" maxKey="m5_oi_delta_max" min={-20000} max={20000} step={500} filters={filters} onChange={onChange} />
        <RangeRow label="OI/MCap delta" minKey="m5_oi_mcap_delta_min" maxKey="m5_oi_mcap_delta_max" min={-0.05} max={0.05} step={0.005} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="Trade Dynamics" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <RangeRow label="Entry wait (min)" minKey="wait_min" maxKey="wait_max" min={0} max={4320} step={30} filters={filters} onChange={onChange} />
        <RangeRow label="Trade duration (min)" minKey="trade_dur_min" maxKey="trade_dur_max" min={0} max={4320} step={30} filters={filters} onChange={onChange} />
        <RangeRow label="Target R" minKey="r_min" maxKey="r_max" min={0} max={10} step={0.5} filters={filters} onChange={onChange} />
      </div>

      {sep}
      <GL c="SYNTHESIS" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        <ToggleGroup label="MTF Synthesis" field="sent_synthesis_mtf" options={so.str} filters={filters} onChange={onChange} nowrap />
        <ToggleGroup label="H1 Synthesis"  field="sent_synthesis_h1"  options={so.str} filters={filters} onChange={onChange} nowrap />
        <ToggleGroup label="M5 Synthesis"  field="sent_synthesis_m5"  options={so.str} filters={filters} onChange={onChange} nowrap />
        <ToggleGroup label="Liquidity"     field="sent_liquidity"     options={so.pres} filters={filters} onChange={onChange} nowrap />
      </div>
    </div>
  )
}
