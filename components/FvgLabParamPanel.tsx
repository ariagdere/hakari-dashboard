'use client'
import type { FvgParams } from '@/lib/fvgEngine'

interface Props {
  params: FvgParams
  onChange: (p: FvgParams) => void
  onReset: () => void
}

function NumberField({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-3)', marginBottom: 7, gap: 8 }}>
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="mono"
        style={{ width: 72, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, padding: '4px 6px', borderRadius: 4 }} />
    </label>
  )
}

function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-3)', marginBottom: 7, gap: 8 }}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as T)}
        style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, padding: '4px 6px', borderRadius: 4 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-3)', marginBottom: 7, gap: 8 }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  )
}

export default function FvgLabParamPanel({ params, onChange, onReset }: Props) {
  const set = <K extends keyof FvgParams>(k: K, v: FvgParams[K]) => onChange({ ...params, [k]: v })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Parametreler</div>
        <button onClick={onReset} className="filter-btn" style={{ fontSize: 10, padding: '4px 10px' }}>Varsayılana dön</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Group title="Swing Tespiti">
          <NumberField label="Swing lookback" value={params.swingLookback} min={1} max={15} onChange={v => set('swingLookback', v)} />
          <NumberField label="Swing arama penceresi" value={params.swingSearchWindow} min={1} max={60} onChange={v => set('swingSearchWindow', v)} />
          <SelectField label="Seçim modu" value={params.swingSelectMode}
            options={[{ value: 'nearest', label: 'En yakın' }, { value: 'extreme', label: 'En uç' }]}
            onChange={v => set('swingSelectMode', v)} />
        </Group>

        <Group title="Likidite Alımı">
          <NumberField label="Yakınlık eşiği" value={params.sweepProximityPct} min={0} max={1.2} step={0.05} onChange={v => set('sweepProximityPct', v)} />
          <NumberField label="İğne/gövde oranı" value={params.wickBodyRatioMin} min={0} max={10} step={0.1} onChange={v => set('wickBodyRatioMin', v)} />
        </Group>

        <Group title="Displacement">
          <NumberField label="Gövde/range eşiği" value={params.bodyRatioThreshold} min={0} max={1} step={0.05} onChange={v => set('bodyRatioThreshold', v)} />
          <NumberField label="Ortalama range lookback" value={params.avgRangeLookback} min={3} max={30} onChange={v => set('avgRangeLookback', v)} />
          <NumberField label="Range çarpanı" value={params.rangeMultiplier} min={1} max={5} step={0.1} onChange={v => set('rangeMultiplier', v)} />
        </Group>

        <Group title="Hangi Kriterler Sayılsın">
          <CheckField label="Likidite Alımı" checked={params.useSweepCriterion} onChange={v => set('useSweepCriterion', v)} />
          <CheckField label="BOS Örtüşmesi" checked={params.useBosCriterion} onChange={v => set('useBosCriterion', v)} />
          <CheckField label="Displacement" checked={params.useDisplacementCriterion} onChange={v => set('useDisplacementCriterion', v)} />
          <SelectField label="Trade alma koşulu" value={params.tradeConditionMode}
            options={[{ value: 'all', label: 'Hepsi geçmeli' }, { value: 'any', label: 'Biri yeter' }, { value: 'always', label: 'Her zaman al' }]}
            onChange={v => set('tradeConditionMode', v)} />
        </Group>

        <Group title="FVG Yaşlanması">
          <NumberField label="Maks. geçerlilik (mum)" value={params.fvgMaxAgeCandles} min={1} max={200} onChange={v => set('fvgMaxAgeCandles', v)} />
        </Group>

        <Group title="Setup — SL / TP">
          <SelectField label="SL nereye" value={params.slMode}
            options={[{ value: 'swept_swing', label: 'Süpürülen swing' }, { value: 'fvg_edge', label: "FVG'nin karşı kenarı" }]}
            onChange={v => set('slMode', v)} />
          <NumberField label="SL tamponu (%)" value={params.slBufferPct} min={0.1} max={1.5} step={0.05} onChange={v => set('slBufferPct', v)} />
          <SelectField label="TP yerleşimi" value={params.tpPlacementMode}
            options={[{ value: 'exact', label: "Swing'in tam ucu" }, { value: 'percentage', label: 'Yüzde (geri çekilmiş)' }, { value: 'dynamic_zone', label: 'Dinamik bölge' }]}
            onChange={v => set('tpPlacementMode', v)} />
          <NumberField label="TP yüzdesi" value={params.tpTargetPct} min={0.1} max={1.2} step={0.05} onChange={v => set('tpTargetPct', v)} />
          <NumberField label="TP bölge yüzdesi" value={params.tpZonePct} min={0.1} max={0.99} step={0.05} onChange={v => set('tpZonePct', v)} />
          <NumberField label="TP arama penceresi" value={params.tpSwingSearchWindow} min={1} max={200} onChange={v => set('tpSwingSearchWindow', v)} />
          <SelectField label="TP bulunamazsa" value={params.tpFallbackMode}
            options={[{ value: 'no_trade', label: 'İşlem yok' }, { value: '1R', label: '1R' }, { value: '2R', label: '2R' }, { value: '3R', label: '3R' }]}
            onChange={v => set('tpFallbackMode', v)} />
        </Group>

        <Group title="Simülasyon Davranışı">
          <NumberField label="Maks. işlem süresi (mum)" value={params.maxTradeDurationCandles} min={1} max={2000} onChange={v => set('maxTradeDurationCandles', v)} />
          <CheckField label="Sequential trade (üst üste açma)" checked={params.sequentialTradesOnly} onChange={v => set('sequentialTradesOnly', v)} />
        </Group>
      </div>
    </div>
  )
}
