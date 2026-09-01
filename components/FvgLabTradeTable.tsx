'use client'
import type { SimTrade } from '@/lib/fvgBacktest'

interface Props {
  trades: SimTrade[]
  selectedIdx: number | null
  onSelect: (fvgIndex: number) => void
}

function fmtTime(ms: number) {
  const d = new Date(ms + 3 * 3600 * 1000) // UTC+3 gosterim, proje konvansiyonu
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function Dot({ v }: { v: boolean | null }) {
  if (v == null) return <span style={{ color: 'var(--text-3)', opacity: 0.4 }}>–</span>
  return <span style={{ color: v ? 'var(--green)' : 'var(--text-3)' }}>{v ? '●' : '○'}</span>
}

// ZLEMA'nin HAM zone degeri -- pass/fail(Dot)'tan FARKLI, trade yonune
// BAKMADAN o andaki zone'un kendisini gosterir (dogrulama amacli).
function ZoneLabel({ v }: { v: 'bullish' | 'bearish' | 'no_trade' | null }) {
  if (v == null) return <span style={{ color: 'var(--text-3)', opacity: 0.4 }}>–</span>
  if (v === 'no_trade') return <span style={{ color: 'var(--text-3)' }}>No Trade</span>
  return <span style={{ color: v === 'bullish' ? 'var(--green)' : 'var(--red)' }}>{v === 'bullish' ? 'Bull' : 'Bear'}</span>
}

// Liq Cluster Yakin/Uzak -- liqClusterNearPass true/false/null'dan turetilir
// (near ve far birbirinin ters'i oldugu icin tek kolon yeterli).
function NearFarLabel({ v }: { v: boolean | null }) {
  if (v == null) return <span style={{ color: 'var(--text-3)', opacity: 0.4 }}>–</span>
  return <span style={{ color: v ? 'var(--green)' : 'var(--text-3)' }}>{v ? 'Yakın' : 'Uzak'}</span>
}

// Displacement'in HANGI alt-kosuldan basarisiz oldugunu gosterir -- ilk nokta
// govde-orani esigini, ikinci nokta aralik/momentum esigini temsil eder.
// Uzerine gelince tam sayisal degerleri (title) gosterir.
function DisplacementDetail({ bodyRatio, bodyRatioPass, range, avgRange, rangePass }: {
  bodyRatio: number | null; bodyRatioPass: boolean | null
  range: number | null; avgRange: number | null; rangePass: boolean | null
}) {
  if (bodyRatio == null || range == null || avgRange == null) return <span style={{ color: 'var(--text-3)', opacity: 0.4 }}>–</span>
  const rangeRatio = avgRange > 0 ? range / avgRange : null
  const title = `Gövde oranı: %${(bodyRatio * 100).toFixed(0)} (eşik geçti mi: ${bodyRatioPass ? 'evet' : 'hayır'}) · Aralık: ortalamanın ${rangeRatio != null ? rangeRatio.toFixed(2) : '?'}x'i (eşik geçti mi: ${rangePass ? 'evet' : 'hayır'})`
  return (
    <span title={title} style={{ cursor: 'help' }}>
      <span style={{ color: bodyRatioPass ? 'var(--green)' : 'var(--text-3)' }}>{bodyRatioPass ? '●' : '○'}</span>
      <span style={{ color: rangePass ? 'var(--green)' : 'var(--text-3)', marginLeft: 3 }}>{rangePass ? '●' : '○'}</span>
    </span>
  )
}

function ResultBadge({ result }: { result: string }) {
  const cls = result === 'TP_HIT' ? 'badge-tp' : result === 'SL_HIT' ? 'badge-sl' : 'badge-exp'
  const label = result === 'TP_HIT' ? 'TP' : result === 'SL_HIT' ? 'SL' : 'EXP'
  return <span className={`badge ${cls}`} style={{ fontSize: 10, padding: '2px 6px' }}>{label}</span>
}

export default function FvgLabTradeTable({ trades, selectedIdx, onSelect }: Props) {
  if (trades.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Bu aralıkta geçerli işlem bulunamadı.</div>
  }
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Yön', 'Kırılma', 'Likidite', 'BOS', 'Displ.', 'Displ.Detay', 'Gap$', 'Cluster↑', 'Cluster↓', 'Yakınlık', 'ZLEMA1H', 'Zone1H', 'ZLEMA4H', 'Zone4H', 'Entry', 'SL', 'TP', 'RR', 'Sonuç', 'R'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--text-3)', fontWeight: 400, fontSize: 10, letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.slice().reverse().map((t) => {
            const isSelected = selectedIdx === t.fvgIndex
            return (
              <tr key={t.fvgIndex} onClick={() => onSelect(t.fvgIndex)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--bg-3)',
                  background: isSelected ? 'rgba(251,191,36,0.08)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
                }}>
                <td style={{ padding: '7px 10px', color: t.direction === 'LONG' ? 'var(--green)' : 'var(--red)' }}>{t.direction}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{fmtTime(t.filledAt)}</td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.sweepPass} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.bosPass} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.displacementPass} /></td>
                <td style={{ padding: '7px 10px' }}>
                  <DisplacementDetail bodyRatio={t.displacementBodyRatio} bodyRatioPass={t.displacementBodyRatioPass}
                    range={t.displacementRange} avgRange={t.displacementAvgRange} rangePass={t.displacementRangePass} />
                </td>
                <td style={{ padding: '7px 10px', color: t.minGapSizePass ? 'var(--text-2)' : 'var(--red)' }} className="mono" title="FVG'nin top-bottom aralığı (dolar)">
                  {t.gapSize.toFixed(1)}
                </td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.liquidityContext?.clusterUpPrice != null ? t.liquidityContext.clusterUpPrice.toFixed(1) : '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.liquidityContext?.clusterDnPrice != null ? t.liquidityContext.clusterDnPrice.toFixed(1) : '—'}</td>
                <td style={{ padding: '7px 10px' }}><NearFarLabel v={t.liqClusterNearPass} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.zlema1hPass} /></td>
                <td style={{ padding: '7px 10px' }}><ZoneLabel v={t.zlema1hZone} /></td>
                <td style={{ padding: '7px 10px' }}><Dot v={t.zlema4hPass} /></td>
                <td style={{ padding: '7px 10px' }}><ZoneLabel v={t.zlema4hZone} /></td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.entry.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.sl.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.tp.toFixed(1)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-2)' }} className="mono">{t.rr != null ? `1:${t.rr}` : '—'}</td>
                <td style={{ padding: '7px 10px' }}><ResultBadge result={t.result} /></td>
                <td style={{ padding: '7px 10px', color: t.rMultiple >= 0 ? 'var(--green)' : 'var(--red)' }} className="mono">
                  {t.rMultiple >= 0 ? '+' : ''}{t.rMultiple}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
