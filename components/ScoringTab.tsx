'use client'
import { useState, useMemo } from 'react'

// ── DB verisinden sayısal değerleri çıkar ──────────────────────────────────

function parseFirstNumber(str: string): number | null {
  if (!str) return null
  const m = str.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : null
}

function parseLastNumber(str: string): number | null {
  if (!str) return null
  const all = str.match(/[\d.]+/g)
  return all ? parseFloat(all[all.length - 1]) : null
}

function parseDelta(str: string): number | null {
  // "1.88 → 1.60" veya "1.88'den 1.60'a" gibi pattern'ler
  if (!str) return null
  const nums = str.match(/[\d.]+/g)?.map(parseFloat) ?? []
  if (nums.length >= 2) return nums[nums.length - 1] - nums[0]
  return null
}

function parseOIDeltaPct(str: string): number | null {
  // "89,600 ... 92,800" → delta pct
  if (!str) return null
  const nums = str.replace(/,/g, '').match(/\d{4,}/g)?.map(parseFloat) ?? []
  if (nums.length >= 2) {
    const start = nums[0], end = nums[nums.length - 1]
    return ((end - start) / start) * 100
  }
  return null
}

function parsePriceDirection(str: string): number {
  if (!str) return 0
  // fiyat düşerken → -1, fiyat yükselirken → 1
  if (str.includes('düşerken') || str.includes('geriledi') || str.includes('çekildi')) return -1
  if (str.includes('yükseldi') || str.includes('arttı') || str.includes('çıktı')) return 1
  return 0
}

function extractTradeData(data: any) {
  const h1 = {
    global_ls: {
      start: parseFirstNumber(data.h1_global_ls_ratio_comment) ?? 1.5,
      end: parseLastNumber(data.h1_global_ls_ratio_comment) ?? 1.5,
      delta: parseDelta(data.h1_global_ls_ratio_comment) ?? 0,
    },
    tt_accounts: {
      start: parseFirstNumber(data.h1_top_trader_accounts_comment) ?? 1.5,
      end: parseLastNumber(data.h1_top_trader_accounts_comment) ?? 1.5,
      delta: parseDelta(data.h1_top_trader_accounts_comment) ?? 0,
    },
    tt_positions: {
      start: parseFirstNumber(data.h1_top_trader_positions_comment) ?? 0.9,
      end: parseLastNumber(data.h1_top_trader_positions_comment) ?? 0.9,
      delta: parseDelta(data.h1_top_trader_positions_comment) ?? 0,
    },
    oi: {
      delta_pct: parseOIDeltaPct(data.h1_open_interest_comment) ?? 0,
    },
    oi_mcap: {
      start: parseFirstNumber(data.h1_oi_marketcap_ratio_comment) ?? 0.45,
      end: parseLastNumber(data.h1_oi_marketcap_ratio_comment) ?? 0.45,
    },
    price_direction: parsePriceDirection(data.h1_open_interest_comment),
  }

  const m5 = {
    global_ls: {
      start: parseFirstNumber(data.m5_global_ls_ratio_comment) ?? 1.5,
      end: parseLastNumber(data.m5_global_ls_ratio_comment) ?? 1.5,
      delta: parseDelta(data.m5_global_ls_ratio_comment) ?? 0,
    },
    tt_accounts: {
      start: parseFirstNumber(data.m5_top_trader_accounts_comment) ?? 1.5,
      end: parseLastNumber(data.m5_top_trader_accounts_comment) ?? 1.5,
      delta: parseDelta(data.m5_top_trader_accounts_comment) ?? 0,
    },
    tt_positions: {
      start: parseFirstNumber(data.m5_top_trader_positions_comment) ?? 0.9,
      end: parseLastNumber(data.m5_top_trader_positions_comment) ?? 0.9,
      delta: parseDelta(data.m5_top_trader_positions_comment) ?? 0,
    },
    oi: {
      delta_pct: parseOIDeltaPct(data.m5_open_interest_comment) ?? 0,
    },
    oi_mcap: {
      start: parseFirstNumber(data.m5_oi_marketcap_ratio_comment) ?? 0.45,
      end: parseLastNumber(data.m5_oi_marketcap_ratio_comment) ?? 0.45,
    },
    price_direction: parsePriceDirection(data.m5_open_interest_comment),
  }

  // m5 OI comment'ta fiyat düşerken OI artışı var mı özellikle kontrol et
  const m5OIComment = data.m5_open_interest_comment ?? ''
  if (m5OIComment.includes('düşerken') || m5OIComment.includes('geriledikçe')) {
    m5.price_direction = -1
  }

  return { h1, m5 }
}

// ── SCORING FUNCTIONS ──────────────────────────────────────────────────────

function scoreSingle(metric: string, value: number): number {
  const rules: Record<string, (v: number) => number> = {
    ls_delta: v => v < -0.15 ? -3 : v < -0.05 ? -2 : v < -0.02 ? -1 : v > 0.15 ? 3 : v > 0.05 ? 2 : v > 0.02 ? 1 : 0,
    tt_pos_level: v => v < 0.80 ? -3 : v < 0.85 ? -2 : v < 0.95 ? -1 : v > 1.20 ? 3 : v > 1.10 ? 2 : v > 1.05 ? 1 : 0,
    tt_pos_delta: v => v < -0.03 ? -2 : v < -0.01 ? -1 : v > 0.03 ? 2 : v > 0.01 ? 1 : 0,
    oi_delta_pct: v => Math.abs(v) > 3 ? 2 : Math.abs(v) > 1.5 ? 1 : 0,
    oi_mcap_level: v => v > 0.50 ? 2 : v > 0.45 ? 1 : 0,
    tt_acc_delta: v => v < -0.15 ? -2 : v < -0.05 ? -1 : v > 0.15 ? 2 : v > 0.05 ? 1 : 0,
  }
  return rules[metric] ? rules[metric](value) : 0
}

type Interaction = { score: number; label: string; type: string }

function pairOI_Price(oi_delta_pct: number, price_dir: number): Interaction {
  if (oi_delta_pct > 1.0 && price_dir === -1) return { score: -3, label: 'Agresif Short Girişi', type: 'bearish' }
  if (oi_delta_pct > 1.0 && price_dir === 1) return { score: 3, label: 'Agresif Long Girişi', type: 'bullish' }
  if (oi_delta_pct < -1.0 && price_dir === -1) return { score: -1, label: 'Long Kapanışı', type: 'bearish' }
  if (oi_delta_pct < -1.0 && price_dir === 1) return { score: 1, label: 'Short Kapanışı', type: 'bullish' }
  return { score: 0, label: 'Nötr', type: 'neutral' }
}

function pairTTPos_GlobalLS(tt_pos_end: number, global_ls_end: number): Interaction {
  const gap = (global_ls_end - tt_pos_end).toFixed(2)
  if (tt_pos_end < 0.90 && global_ls_end > 1.40) return { score: -3, label: `Retail Tuzağı (gap: ${gap})`, type: 'bearish' }
  if (tt_pos_end < 0.95 && global_ls_end > 1.20) return { score: -2, label: `Kısmi Ayrışma (gap: ${gap})`, type: 'bearish' }
  if (tt_pos_end > 1.10 && global_ls_end < 0.80) return { score: 3, label: `Tersi Tuzak (gap: ${gap})`, type: 'bullish' }
  if (tt_pos_end > 1.05 && global_ls_end < 0.90) return { score: 2, label: `Kısmi Tersi (gap: ${gap})`, type: 'bullish' }
  return { score: 0, label: 'Ayrışma Yok', type: 'neutral' }
}

function pairOIMcap_TTPos(oi_mcap_end: number, tt_pos_end: number): Interaction {
  if (oi_mcap_end > 0.45 && tt_pos_end < 0.90) return { score: -2, label: 'Kaldıraçlı Smart Short', type: 'bearish' }
  if (oi_mcap_end > 0.45 && tt_pos_end > 1.10) return { score: 2, label: 'Kaldıraçlı Smart Long', type: 'bullish' }
  if (oi_mcap_end > 0.50) return { score: 0, label: 'Aşırı Kaldıraç — Yönsüz Risk', type: 'warning' }
  return { score: 0, label: 'Normal Kaldıraç', type: 'neutral' }
}

function trioOI_Price_TTPos(oi_delta_pct: number, price_dir: number, tt_pos_delta: number): Interaction {
  const oi_short = oi_delta_pct > 1.0 && price_dir === -1
  const tt_confirms = tt_pos_delta < -0.02
  if (oi_short && tt_confirms) return { score: -4, label: '3x Teyitli Short', type: 'bearish' }
  const oi_long = oi_delta_pct > 1.0 && price_dir === 1
  const tt_confirms_long = tt_pos_delta > 0.02
  if (oi_long && tt_confirms_long) return { score: 4, label: '3x Teyitli Long', type: 'bullish' }
  if (oi_short && !tt_confirms) return { score: -1, label: 'Kısmi Short (TT teyitsiz)', type: 'weak_bearish' }
  if (oi_long && !tt_confirms_long) return { score: 1, label: 'Kısmi Long (TT teyitsiz)', type: 'weak_bullish' }
  return { score: 0, label: 'Sinyal Yok', type: 'neutral' }
}

function trioLS_TTAcc_TTPos(ls_delta: number, tt_acc_delta: number, tt_pos_delta: number): Interaction {
  const allBearish = ls_delta < -0.02 && tt_acc_delta < -0.02 && tt_pos_delta < -0.02
  const allBullish = ls_delta > 0.02 && tt_acc_delta > 0.02 && tt_pos_delta > 0.02
  const divergence = (ls_delta < -0.02 && tt_acc_delta < -0.02 && tt_pos_delta > 0.02) ||
                     (ls_delta > 0.02 && tt_acc_delta > 0.02 && tt_pos_delta < -0.02)
  if (allBearish) return { score: -3, label: 'Tam Bearish Konsensüs', type: 'bearish' }
  if (allBullish) return { score: 3, label: 'Tam Bullish Konsensüs', type: 'bullish' }
  if (divergence) return { score: tt_pos_delta < 0 ? -2 : 2, label: 'Büyük Balık Ayrışması', type: tt_pos_delta < 0 ? 'bearish' : 'bullish' }
  return { score: 0, label: 'Mixed', type: 'neutral' }
}

function trioOIMcap_OI_Price(oi_mcap_end: number, oi_delta_pct: number, price_dir: number): Interaction {
  const highLev = oi_mcap_end > 0.45
  const oiSpike = oi_delta_pct > 1.5
  const priceAgainst = (oi_delta_pct > 0 && price_dir === -1) || (oi_delta_pct < 0 && price_dir === 1)
  if (highLev && oiSpike && priceAgainst) return { score: price_dir === -1 ? -3 : 3, label: 'Likidasyon Kaskadı Riski', type: 'critical' }
  if (highLev && oiSpike) return { score: 1, label: 'Yüksek Kaldıraç + Spike', type: 'warning' }
  return { score: 0, label: 'Normal', type: 'neutral' }
}

const defaultWeights = {
  singles: { ls_delta: 0.06, tt_pos_level: 0.10, tt_pos_delta: 0.08, oi_delta_pct: 0.06, oi_mcap_level: 0.04, tt_acc_delta: 0.04 },
  pairs: { oi_price: 0.14, ttpos_globalils: 0.12, oimcap_ttpos: 0.08 },
  trios: { oi_price_ttpos: 0.12, ls_ttacc_ttpos: 0.06, oimcap_oi_price: 0.06 },
  mtf_confluence: 0.04,
}

function computeAll(tradeData: ReturnType<typeof extractTradeData>, weights: typeof defaultWeights) {
  const results: any = { h1: {}, m5: {} }

  for (const tf of ['h1', 'm5'] as const) {
    const d = tradeData[tf]
    results[tf].singles = {
      ls_delta:      { value: d.global_ls.delta,      score: scoreSingle('ls_delta', d.global_ls.delta) },
      tt_pos_level:  { value: d.tt_positions.end,      score: scoreSingle('tt_pos_level', d.tt_positions.end) },
      tt_pos_delta:  { value: d.tt_positions.delta,    score: scoreSingle('tt_pos_delta', d.tt_positions.delta) },
      oi_delta_pct:  { value: d.oi.delta_pct,          score: scoreSingle('oi_delta_pct', d.oi.delta_pct) },
      oi_mcap_level: { value: d.oi_mcap.end,           score: scoreSingle('oi_mcap_level', d.oi_mcap.end) },
      tt_acc_delta:  { value: d.tt_accounts.delta,     score: scoreSingle('tt_acc_delta', d.tt_accounts.delta) },
    }
    results[tf].pairs = {
      oi_price:        pairOI_Price(d.oi.delta_pct, d.price_direction),
      ttpos_globalils: pairTTPos_GlobalLS(d.tt_positions.end, d.global_ls.end),
      oimcap_ttpos:    pairOIMcap_TTPos(d.oi_mcap.end, d.tt_positions.end),
    }
    results[tf].trios = {
      oi_price_ttpos:   trioOI_Price_TTPos(d.oi.delta_pct, d.price_direction, d.tt_positions.delta),
      ls_ttacc_ttpos:   trioLS_TTAcc_TTPos(d.global_ls.delta, d.tt_accounts.delta, d.tt_positions.delta),
      oimcap_oi_price:  trioOIMcap_OI_Price(d.oi_mcap.end, d.oi.delta_pct, d.price_direction),
    }
  }

  const tfScores: Record<string, number> = {}
  for (const tf of ['h1', 'm5']) {
    let sum = 0
    Object.entries(results[tf].singles).forEach(([k, v]: any) => { sum += v.score * (weights.singles[k as keyof typeof weights.singles] || 0) })
    Object.entries(results[tf].pairs).forEach(([k, v]: any) => { sum += v.score * (weights.pairs[k as keyof typeof weights.pairs] || 0) })
    Object.entries(results[tf].trios).forEach(([k, v]: any) => { sum += v.score * (weights.trios[k as keyof typeof weights.trios] || 0) })
    tfScores[tf] = sum
  }

  const sameDirection = Math.sign(tfScores.h1) === Math.sign(tfScores.m5) && tfScores.h1 !== 0
  const mtfBonus = sameDirection ? Math.sign(tfScores.h1) * weights.mtf_confluence * 3 : 0
  const totalScore = (tfScores.h1 * 0.55 + tfScores.m5 * 0.45) + mtfBonus

  let direction = 'WAIT'
  if (totalScore < -0.8) direction = 'SHORT'
  else if (totalScore > 0.8) direction = 'LONG'

  const confidence = Math.min(100, Math.round(Math.abs(totalScore) * 25))

  return { results, tfScores, mtfBonus, sameDirection, totalScore, direction, confidence }
}

// ── UI ─────────────────────────────────────────────────────────────────────

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  bearish:      { bg: 'rgba(239,68,68,0.12)',   text: 'var(--red)',   border: 'rgba(239,68,68,0.25)' },
  bullish:      { bg: 'rgba(74,222,128,0.12)',  text: 'var(--green)', border: 'rgba(74,222,128,0.25)' },
  neutral:      { bg: 'var(--bg-3)',            text: 'var(--text-3)',border: 'var(--border)' },
  warning:      { bg: 'rgba(251,191,36,0.12)',  text: 'var(--amber)', border: 'rgba(251,191,36,0.25)' },
  critical:     { bg: 'rgba(168,85,247,0.15)',  text: '#c084fc',      border: 'rgba(168,85,247,0.30)' },
  weak_bearish: { bg: 'rgba(239,68,68,0.06)',   text: '#fca5a5',      border: 'rgba(239,68,68,0.15)' },
  weak_bullish: { bg: 'rgba(74,222,128,0.06)',  text: '#86efac',      border: 'rgba(74,222,128,0.15)' },
}

function ScoreBadge({ score }: { score: number }) {
  const color = score < 0 ? 'var(--red)' : score > 0 ? 'var(--green)' : 'var(--text-3)'
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 36, padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700,
      background: score < 0 ? 'rgba(239,68,68,0.15)' : score > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(148,163,184,0.10)',
      color,
    }}>
      {score > 0 ? '+' : ''}{score}
    </span>
  )
}

function InteractionCard({ name, result, weight }: { name: string; result: Interaction; weight: string }) {
  const c = typeColors[result.type] || typeColors.neutral
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div className="col-label" style={{ marginBottom: 3 }}>{name}</div>
        <div className="mono" style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>{result.label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ScoreBadge score={result.score} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>×{weight}</span>
      </div>
    </div>
  )
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', width: 140 }}>{label}</span>
      <input type="range" min={0} max={30} value={Math.round(value * 100)}
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        style={{ flex: 1, accentColor: 'var(--amber)', height: 3 }} />
      <span className="mono" style={{ fontSize: 11, color: 'var(--amber)', width: 36, textAlign: 'right' }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}

const singleLabels: Record<string, string> = {
  ls_delta: 'L/S Delta',
  tt_pos_level: 'TT Positions Seviye',
  tt_pos_delta: 'TT Positions Delta',
  oi_delta_pct: 'OI Değişim %',
  oi_mcap_level: 'OI/MCap Seviye',
  tt_acc_delta: 'TT Accounts Delta',
}

const pairLabels: Record<string, string> = {
  oi_price: 'OI → Fiyat',
  ttpos_globalils: 'TT Pos → Global L/S',
  oimcap_ttpos: 'OI/MCap → TT Pos',
}

const trioLabels: Record<string, string> = {
  oi_price_ttpos: 'OI + Fiyat + TT Pos',
  ls_ttacc_ttpos: 'L/S + TT Acc + TT Pos',
  oimcap_oi_price: 'OI/MCap + OI + Fiyat',
}

export default function ScoringTab({ data }: { data: any }) {
  const [weights, setWeights] = useState(defaultWeights)
  const [showWeights, setShowWeights] = useState(false)

  const tradeData = useMemo(() => extractTradeData(data), [data])
  const result = useMemo(() => computeAll(tradeData, weights), [tradeData, weights])

  const updateWeight = (category: keyof typeof weights, key: string, val: number) => {
    setWeights(prev => ({ ...prev, [category]: { ...(prev[category] as any), [key]: val } }))
  }

  const dirColor = result.direction === 'SHORT' ? 'var(--red)' : result.direction === 'LONG' ? 'var(--green)' : 'var(--amber)'
  const aiDir = data.direction
  const aiMatch = aiDir === result.direction

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Final Decision */}
      <div style={{ background: 'var(--bg-2)', border: `1px solid ${dirColor}44`, borderRadius: 10, padding: 20, textAlign: 'center' }}>
        <div className="col-label" style={{ marginBottom: 8 }}>Deterministik Skorlama Motoru</div>
        <div className="mono" style={{ fontSize: 32, fontWeight: 700, color: dirColor, letterSpacing: 2 }}>
          {result.direction}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 14 }}>
          {[
            { label: 'Toplam Skor', val: result.totalScore.toFixed(2), color: dirColor },
            { label: 'Güven', val: `%${result.confidence}`, color: 'var(--text)' },
            { label: 'MTF Uyum', val: result.sameDirection ? '✓' : '✗', color: result.sameDirection ? 'var(--green)' : 'var(--amber)' },
            { label: 'AI Önerisi', val: aiDir, color: aiMatch ? 'var(--green)' : 'var(--red)' },
          ].map((x, i) => (
            <div key={i}>
              <div className="col-label" style={{ marginBottom: 4 }}>{x.label}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: x.color }}>{x.val}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 12 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            H1: <span style={{ color: tfColor(result.tfScores.h1) }}>{result.tfScores.h1.toFixed(2)}</span>
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            M5: <span style={{ color: tfColor(result.tfScores.m5) }}>{result.tfScores.m5.toFixed(2)}</span>
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            MTF Bonus: <span style={{ color: '#c084fc' }}>{result.mtfBonus.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {/* TF Sections */}
      {(['h1', 'm5'] as const).map(tf => (
        <div key={tf} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div className="mono" style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 14,
            color: tf === 'h1' ? '#60a5fa' : '#a78bfa',
            borderBottom: `1px solid ${tf === 'h1' ? 'rgba(96,165,250,0.2)' : 'rgba(167,139,250,0.2)'}`,
            paddingBottom: 8,
          }}>
            {tf === 'h1' ? '1H ANCHOR' : '5M EXECUTION'}
          </div>

          {/* Singles */}
          <div className="col-label" style={{ marginBottom: 8 }}>Tekil Metrikler</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            {Object.entries(result.results[tf].singles).map(([k, v]: any) => (
              <div key={k} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="col-label" style={{ marginBottom: 2 }}>{singleLabels[k] || k}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {typeof v.value === 'number' ? (Math.abs(v.value) > 10 ? v.value.toFixed(1) : v.value.toFixed(3)) : v.value}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ScoreBadge score={v.score} />
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>×{((weights.singles[k as keyof typeof weights.singles] || 0) * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pairs */}
          <div className="col-label" style={{ marginBottom: 8 }}>İkili Etkileşimler</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {Object.entries(result.results[tf].pairs).map(([k, v]: any) => (
              <InteractionCard key={k} name={pairLabels[k] || k} result={v} weight={((weights.pairs[k as keyof typeof weights.pairs] || 0) * 100).toFixed(0) + '%'} />
            ))}
          </div>

          {/* Trios */}
          <div className="col-label" style={{ marginBottom: 8 }}>Üçlü Etkileşimler</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(result.results[tf].trios).map(([k, v]: any) => (
              <InteractionCard key={k} name={trioLabels[k] || k} result={v} weight={((weights.trios[k as keyof typeof weights.trios] || 0) * 100).toFixed(0) + '%'} />
            ))}
          </div>
        </div>
      ))}

      {/* Weight Controls */}
      <div>
        <button onClick={() => setShowWeights(!showWeights)} style={{
          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 8, padding: '10px 20px', color: '#c084fc', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', width: '100%', fontFamily: 'DM Mono, monospace',
        }}>
          {showWeights ? 'Ağırlıkları Gizle ▲' : 'Ağırlıkları Ayarla ▼'}
        </button>

        {showWeights && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginTop: 8 }}>
            <div className="col-label" style={{ marginBottom: 10, color: '#c084fc' }}>Tekil Ağırlıklar</div>
            {Object.entries(weights.singles).map(([k, v]) => (
              <WeightSlider key={k} label={singleLabels[k] || k} value={v} onChange={val => updateWeight('singles', k, val)} />
            ))}
            <div className="col-label" style={{ marginBottom: 10, marginTop: 14, color: '#c084fc' }}>Pair Ağırlıklar</div>
            {Object.entries(weights.pairs).map(([k, v]) => (
              <WeightSlider key={k} label={pairLabels[k] || k} value={v} onChange={val => updateWeight('pairs', k, val)} />
            ))}
            <div className="col-label" style={{ marginBottom: 10, marginTop: 14, color: '#c084fc' }}>Trio Ağırlıklar</div>
            {Object.entries(weights.trios).map(([k, v]) => (
              <WeightSlider key={k} label={trioLabels[k] || k} value={v} onChange={val => updateWeight('trios', k, val)} />
            ))}
            <div className="col-label" style={{ marginBottom: 10, marginTop: 14, color: '#c084fc' }}>MTF Confluence</div>
            <WeightSlider label="mtf_confluence" value={weights.mtf_confluence} onChange={val => setWeights(prev => ({ ...prev, mtf_confluence: val }))} />

            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 6 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>
                Toplam Ağırlık: {(
                  Object.values(weights.singles).reduce((a, b) => a + b, 0) +
                  Object.values(weights.pairs).reduce((a, b) => a + b, 0) +
                  Object.values(weights.trios).reduce((a, b) => a + b, 0) +
                  weights.mtf_confluence
                ).toFixed(2)} — İdeal: ~1.00
              </span>
            </div>
            <button onClick={() => setWeights(defaultWeights)} style={{
              marginTop: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 6, padding: '7px 14px', color: 'var(--red)', fontSize: 11, cursor: 'pointer', width: '100%', fontFamily: 'DM Mono, monospace',
            }}>
              Varsayılana Sıfırla
            </button>
          </div>
        )}
      </div>

      {/* Formula */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <div className="col-label" style={{ marginBottom: 10 }}>Formül</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.9 }}>
          <div>TF_skor = Σ(tekil × ağırlık) + Σ(pair × ağırlık) + Σ(trio × ağırlık)</div>
          <div>Final = H1 × 0.55 + M5 × 0.45 + MTF_bonus</div>
          <div style={{ color: 'var(--text-3)' }}>{'< -0.8 → SHORT  |  > 0.8 → LONG  |  arada → WAIT'}</div>
        </div>
      </div>
    </div>
  )
}

function tfColor(score: number) {
  return score < 0 ? 'var(--red)' : score > 0 ? 'var(--green)' : 'var(--text-3)'
}
