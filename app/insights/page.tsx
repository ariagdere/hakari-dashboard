'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Chart as ChartJS,
  Tooltip, LineElement, PointElement,
  LinearScale, CategoryScale, BarElement, Filler,
} from 'chart.js'
import { Bar, Scatter } from 'react-chartjs-2'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler)

interface Overview {
  total: number; tp_count: number; sl_count: number
  expired_count: number; no_entry_count: number; pending_count: number
  win_rate: number; avg_r_win: number; avg_r_loss: number
  avg_duration_mins: number; total_pnl: number
  seq_total: number; seq_win_rate: number
  long_total: number; long_win_rate: number
  short_total: number; short_win_rate: number
}
interface ScoringRow  { score: number; total: number; wins: number; win_rate: number }
interface RsiRow      { rsi_zone: string; total: number; wins: number; win_rate: number; total_short: number; wins_short: number; win_rate_short: number; total_long: number; wins_long: number; win_rate_long: number }
interface ScoringData { by_score: ScoringRow[]; by_confidence: ScoringRow[]; by_rsi: RsiRow[] }
interface IndicatorRow { indicator: string; sentiment: string; total: number; wins: number; win_rate: number; total_short: number; wins_short: number; win_rate_short: number; total_long: number; wins_long: number; win_rate_long: number }
interface MtfRow       { h1: string; m5: string; mtf: string; total: number; wins: number; win_rate: number }
interface LiqRow       { liquidity: string; market_power: string; total: number; wins: number; win_rate: number }
interface SentimentData { indicators: IndicatorRow[]; mtf_confluence: MtfRow[]; liquidity_cross: LiqRow[] }
interface DirSentRow   { direction: string; mtf_strength: string; total: number; wins: number; win_rate: number }
interface ScoreSentRow { score_bucket: string; mtf_strength: string; total: number; wins: number; win_rate: number }
interface CombRow      { pair_name?: string; trio_name?: string; combination: string; total: number; wins: number; win_rate: number }
interface PairsData    { direction_x_sentiment: DirSentRow[]; score_x_sentiment: ScoreSentRow[]; long_pairs: CombRow[]; short_pairs: CombRow[]; long_trios: CombRow[]; short_trios: CombRow[] }
interface RHistRow   { sim_result: string; r_bucket: number; count: number }
interface ScatterRow { id: number; sim_result: string; mfe: number; mae: number; r_multiple: number; score: number }
interface MfeRow     { mfe_bucket: string; total: number; tp_count: number; avg_mins: number }
interface RmaeData   { r_histogram: RHistRow[]; scatter: ScatterRow[]; mfe_distribution: MfeRow[] }
interface HourlyRow  { hour: number; total: number; tp_count: number; sl_count: number; win_rate: number; avg_r_tp: number | null }
interface HourlyData { by_analysis: HourlyRow[] }

const N = (v: any, d = 1) => v == null ? '—' : Number(v).toFixed(d)
const winColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  if (v >= 50) return 'var(--green)'
  if (v >= 40) return 'var(--amber)'
  return 'var(--red)'
}
const sentLabel = (s: string) => {
  if (!s) return { label: '—', color: 'var(--text-3)' }
  if (s === 'bullish')          return { label: 'bullish',  color: 'var(--green)' }
  if (s === 'bearish')          return { label: 'bearish',  color: 'var(--red)' }
  if (s === 'buying_pressure')  return { label: 'buying',   color: 'var(--green)' }
  if (s === 'selling_pressure') return { label: 'selling',  color: 'var(--red)' }
  if (s === 'strong')           return { label: 'strong',   color: 'var(--green)' }
  if (s === 'weak')             return { label: 'weak',     color: 'var(--red)' }
  return { label: s, color: 'var(--amber)' }
}
const CHART_DEFAULTS = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
const axisStyle = {
  grid: { color: '#1a1a1a' },
  ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } },
  border: { color: '#242424' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="stat-card">
      <div className="col-label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}

function WinBar({ rate, total }: { rate: number | null; total: number }) {
  const val = rate ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(val, 100)}%`, height: '100%', background: winColor(rate), borderRadius: 2 }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: winColor(rate), minWidth: 40, textAlign: 'right' }}>{val.toFixed(1)}%</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', minWidth: 32, textAlign: 'right' }}>n={total}</span>
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="col-label" style={{ marginBottom: 12, fontSize: 11 }}>{children}</div>
}

function CombTable({ rows, nameKey }: { rows: any[]; nameKey: string }) {
  if (!rows?.length) return <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>veri yok</span>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
        <thead>
          <tr>{['#', 'Tip', 'Kombinasyon', 'n', 'Win%'].map((h, i) => (
            <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 0', color: 'var(--text-3)', width: 20 }}>{i + 1}</td>
              <td style={{ padding: '6px 0', color: 'var(--text-3)', fontSize: 10, minWidth: 80 }}>{row[nameKey]}</td>
              <td style={{ padding: '6px 0', color: 'var(--text-2)' }}>{row.combination}</td>
              <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)', width: 32 }}>{row.total}</td>
              <td style={{ padding: '6px 0', textAlign: 'right', color: winColor(Number(row.win_rate)), fontWeight: 500, width: 48 }}>{Number(row.win_rate).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 } as const

export default function InsightsPage() {
  const [overview,  setOverview]  = useState<Overview | null>(null)
  const [scoring,   setScoring]   = useState<ScoringData | null>(null)
  const [sentiment, setSentiment] = useState<SentimentData | null>(null)
  const [pairs,     setPairs]     = useState<PairsData | null>(null)
  const [rmae,      setRmae]      = useState<RmaeData | null>(null)
  const [hourly,    setHourly]    = useState<HourlyData | null>(null)
  const [loading,   setLoading]   = useState(true)

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/insights-overview',  { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-scoring',   { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-sentiment', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-pairs',     { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-rmae',      { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/hourly-stats',       { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ov, sc, se, pa, rm, hr]) => {
      setOverview(ov); setScoring(sc); setSentiment(se); setPairs(pa); setRmae(rm); setHourly(hr)
      setLoading(false)
    })
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchAll() }
    const onFocus   = () => fetchAll()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchAll])

  const fmtDur = (mins: any) => {
    if (!mins) return '—'
    const h = Math.floor(Number(mins) / 60)
    const m = Math.round(Number(mins) % 60)
    return h > 0 ? `${h}s ${m}dk` : `${m}dk`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64, overflowX: 'hidden' }}>
      <div className="container" style={{ paddingTop: 28, maxWidth: '100%', overflowX: 'hidden' }}>

        {loading && (
          <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-3)' }} className="mono">yükleniyor...</div>
        )}

        {!loading && overview && (
          <>
            {/* ── 1. OVERVIEW ──────────────────────────────────────────────── */}
            <Section title="Genel Bakış">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 16 }}>
                <StatCard label="Win Rate"   value={`%${Number(overview.win_rate).toFixed(1)}`} color={Number(overview.win_rate) >= 40 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Toplam PnL" value={overview.total_pnl != null ? `${Number(overview.total_pnl) > 0 ? '+' : ''}$${Math.abs(Number(overview.total_pnl)).toFixed(0)}` : '—'} color={Number(overview.total_pnl) > 0 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Ort. Win R"  value={overview.avg_r_win  != null ? `+${N(overview.avg_r_win)}R`  : '—'} color="var(--green)" />
                <StatCard label="Ort. Loss R" value={overview.avg_r_loss != null ? `${N(overview.avg_r_loss)}R` : '—'} color="var(--red)" />
                <StatCard label="Ort. Süre"  value={fmtDur(overview.avg_duration_mins)} />
                <StatCard label="TP Hit"     value={overview.tp_count}      color="var(--green)" />
                <StatCard label="SL Hit"     value={overview.sl_count}      color="var(--red)" />
                <StatCard label="Expired"    value={overview.expired_count} color="var(--amber)" />
              </div>
              <div style={grid2}>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>Yön bazında win rate</CardTitle>
                  {[
                    { label: 'LONG',  rate: Number(overview.long_win_rate),  total: Number(overview.long_total),  color: 'var(--green)' },
                    { label: 'SHORT', rate: Number(overview.short_win_rate), total: Number(overview.short_total), color: 'var(--red)' },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: row.color, display: 'block', marginBottom: 5 }}>{row.label}</span>
                      <WinBar rate={row.rate} total={row.total} />
                    </div>
                  ))}
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>Sequential vs tüm tradeler</CardTitle>
                  {[
                    { label: 'Tüm tradeler', rate: Number(overview.win_rate),     total: Number(overview.tp_count) + Number(overview.sl_count) },
                    { label: 'Sequential',   rate: Number(overview.seq_win_rate), total: Number(overview.seq_total) },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{row.label}</span>
                      <WinBar rate={row.rate} total={row.total} />
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── 2. SCORING ───────────────────────────────────────────────── */}
            {scoring && (
              <Section title="Skor Analizi">
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Market score → win rate</CardTitle>
                    <div style={{ height: 160 }}>
                      <Bar
                        data={{
                          labels: scoring.by_score.map(r => `${r.score}`),
                          datasets: [{ data: scoring.by_score.map(r => Number(r.win_rate)), backgroundColor: scoring.by_score.map(r => Number(r.win_rate) >= 50 ? 'rgba(74,222,128,0.4)' : Number(r.win_rate) >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'), borderColor: scoring.by_score.map(r => Number(r.win_rate) >= 50 ? '#4ade80' : Number(r.win_rate) >= 40 ? '#fbbf24' : '#f87171'), borderWidth: 1 }],
                        }}
                        options={{ ...CHART_DEFAULTS, scales: { x: axisStyle, y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } } } }}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Confidence → win rate</CardTitle>
                    <div style={{ height: 160 }}>
                      <Bar
                        data={{
                          labels: scoring.by_confidence.map(r => `${r.score}`),
                          datasets: [{ data: scoring.by_confidence.map(r => Number(r.win_rate)), backgroundColor: scoring.by_confidence.map(r => Number(r.win_rate) >= 50 ? 'rgba(74,222,128,0.4)' : Number(r.win_rate) >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'), borderColor: scoring.by_confidence.map(r => Number(r.win_rate) >= 50 ? '#4ade80' : Number(r.win_rate) >= 40 ? '#fbbf24' : '#f87171'), borderWidth: 1 }],
                        }}
                        options={{ ...CHART_DEFAULTS, scales: { x: axisStyle, y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } } } }}
                      />
                    </div>
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>RSI 4H zonu → win rate</CardTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {scoring.by_rsi.map(row => (
                      <div key={row.rsi_zone}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>{row.rsi_zone}</span>
                        <div style={{ marginBottom: 4 }}>
                          <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 2, display: 'block' }}>TÜMÜ</span>
                          <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                          <div>
                            <span className="mono" style={{ fontSize: 9, color: 'var(--red)', marginBottom: 2, display: 'block' }}>SHORT</span>
                            <WinBar rate={Number(row.win_rate_short)} total={Number(row.total_short)} />
                          </div>
                          <div>
                            <span className="mono" style={{ fontSize: 9, color: 'var(--green)', marginBottom: 2, display: 'block' }}>LONG</span>
                            <WinBar rate={Number(row.win_rate_long)} total={Number(row.total_long)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* ── 3. SENTIMENT ─────────────────────────────────────────────── */}
            {sentiment && (
              <Section title="Sentiment Analizi">
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <CardTitle>İndikatör × sentiment → win rate</CardTitle>
                  {(() => {
                    const grouped: Record<string, IndicatorRow[]> = {}
                    sentiment.indicators.forEach(r => {
                      if (!grouped[r.indicator]) grouped[r.indicator] = []
                      grouped[r.indicator].push(r)
                    })
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                        {Object.entries(grouped).map(([indicator, rows]) => (
                          <div key={indicator}>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>{indicator}</div>
                            {rows.filter(r => r.sentiment).map(row => {
                              const sl = sentLabel(row.sentiment)
                              return (
                                <div key={row.sentiment} style={{ marginBottom: 10 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                    <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 60, flexShrink: 0 }}>{sl.label}</span>
                                    <div style={{ flex: 1 }}><WinBar rate={Number(row.win_rate)} total={Number(row.total)} /></div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, paddingLeft: 68 }}>
                                    <div>
                                      <span className="mono" style={{ fontSize: 8, color: 'var(--red)', display: 'block', marginBottom: 2 }}>SHORT</span>
                                      <WinBar rate={Number(row.win_rate_short)} total={Number(row.total_short)} />
                                    </div>
                                    <div>
                                      <span className="mono" style={{ fontSize: 8, color: 'var(--green)', display: 'block', marginBottom: 2 }}>LONG</span>
                                      <WinBar rate={Number(row.win_rate_long)} total={Number(row.total_long)} />
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <div style={grid2}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>MTF synthesis kombinasyonları</CardTitle>
                    {sentiment.mtf_confluence.slice(0, 8).map((row, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>H1:{row.h1} M5:{row.m5} MTF:{row.mtf}</span>
                        <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                      </div>
                    ))}
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Liquidity × market power</CardTitle>
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                      <thead>
                        <tr>{['Liquidity', 'Mkt Power', 'n', 'Win%'].map((h, i) => <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {sentiment.liquidity_cross.map((row, i) => {
                          const liq = sentLabel(row.liquidity)
                          const mkt = sentLabel(row.market_power)
                          return (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 0', color: liq.color }}>{liq.label}</td>
                              <td style={{ padding: '6px 0', color: mkt.color }}>{mkt.label}</td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color: winColor(Number(row.win_rate)), fontWeight: 500 }}>{Number(row.win_rate).toFixed(1)}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* ── 4. PAIRS ─────────────────────────────────────────────────── */}
            {pairs && (
              <Section title="Değişken Çiftleri">
                {/* Direction × MTF + Score × MTF overview */}
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Direction × MTF synthesis</CardTitle>
                    {(['LONG', 'SHORT'] as const).map(dir => (
                      <div key={dir} style={{ marginBottom: 14 }}>
                        <span className="mono" style={{ fontSize: 11, color: dir === 'LONG' ? 'var(--green)' : 'var(--red)', display: 'block', marginBottom: 6 }}>{dir}</span>
                        {pairs.direction_x_sentiment.filter(r => r.direction === dir).map(row => {
                          const sl = sentLabel(row.mtf_strength)
                          return (
                            <div key={row.mtf_strength} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 48, flexShrink: 0 }}>{sl.label}</span>
                              <div style={{ flex: 1 }}><WinBar rate={Number(row.win_rate)} total={Number(row.total)} /></div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>Score bucket × MTF synthesis</CardTitle>
                    {['Yüksek (8-10)', 'Orta (5-7)', 'Düşük (1-4)'].map(bucket => (
                      <div key={bucket} style={{ marginBottom: 14 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>{bucket}</span>
                        {pairs.score_x_sentiment.filter(r => r.score_bucket === bucket).length === 0
                          ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>veri yok</span>
                          : pairs.score_x_sentiment.filter(r => r.score_bucket === bucket).map(row => {
                              const sl = sentLabel(row.mtf_strength)
                              return (
                                <div key={row.mtf_strength} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 48, flexShrink: 0 }}>{sl.label}</span>
                                  <div style={{ flex: 1 }}><WinBar rate={Number(row.win_rate)} total={Number(row.total)} /></div>
                                </div>
                              )
                            })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* LONG pairs + trios */}
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>LONG</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi ikili kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.long_total}</span>}
                    </div>
                    <CombTable rows={pairs.long_pairs} nameKey="pair_name" />
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>LONG</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi üçlü kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.long_total}</span>}
                    </div>
                    {pairs.long_trios.length === 0
                      ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>min 5 trade eşiğini geçen üçlü yok</span>
                      : <CombTable rows={pairs.long_trios} nameKey="trio_name" />}
                  </div>
                </div>

                {/* SHORT pairs + trios */}
                <div style={grid2}>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--red)', flexShrink: 0 }}>SHORT</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi ikili kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.short_total}</span>}
                    </div>
                    <CombTable rows={pairs.short_pairs} nameKey="pair_name" />
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--red)', flexShrink: 0 }}>SHORT</span>
                      <span className="col-label" style={{ fontSize: 11 }}>en iyi üçlü kombinasyonlar</span>
                      {overview && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>n={overview.short_total}</span>}
                    </div>
                    {pairs.short_trios.length === 0
                      ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>min 5 trade eşiğini geçen üçlü yok</span>
                      : <CombTable rows={pairs.short_trios} nameKey="trio_name" />}
                  </div>
                </div>
              </Section>
            )}


            {/* ── 5. R MULTIPLE & MFE/MAE ──────────────────────────────────── */}
            {rmae && (
              <Section title="R Multiple & MFE/MAE">
                <div style={{ ...grid2, marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>R multiple dağılımı</CardTitle>
                    <div style={{ height: 180 }}>
                      {(() => {
                        const buckets = Array.from(new Set(rmae.r_histogram.map(r => r.r_bucket))).sort((a, b) => a - b)
                        const tpData  = buckets.map(b => rmae.r_histogram.find(r => r.r_bucket === b && r.sim_result === 'TP_HIT')?.count ?? 0)
                        const slData  = buckets.map(b => rmae.r_histogram.find(r => r.r_bucket === b && r.sim_result === 'SL_HIT')?.count ?? 0)
                        return (
                          <Bar
                            data={{
                              labels: buckets.map(b => `${b > 0 ? '+' : ''}${b}R`),
                              datasets: [
                                { label: 'TP', data: tpData, backgroundColor: 'rgba(74,222,128,0.4)',  borderColor: '#4ade80', borderWidth: 1 },
                                { label: 'SL', data: slData, backgroundColor: 'rgba(248,113,113,0.4)', borderColor: '#f87171', borderWidth: 1 },
                              ],
                            }}
                            options={{ ...CHART_DEFAULTS, plugins: { legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 } } } }, scales: { x: axisStyle, y: { ...axisStyle, ticks: { ...axisStyle.ticks, stepSize: 1 } } } }}
                          />
                        )
                      })()}
                    </div>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <CardTitle>MFE vs MAE scatter</CardTitle>
                    <div style={{ height: 180 }}>
                      <Scatter
                        data={{
                          datasets: [
                            { label: 'TP', data: rmae.scatter.filter(r => r.sim_result === 'TP_HIT').map(r => ({ x: r.mae, y: r.mfe })), backgroundColor: 'rgba(74,222,128,0.5)', pointRadius: 3 },
                            { label: 'SL', data: rmae.scatter.filter(r => r.sim_result === 'SL_HIT').map(r => ({ x: r.mae, y: r.mfe })), backgroundColor: 'rgba(248,113,113,0.5)', pointRadius: 3 },
                          ],
                        }}
                        options={{ ...CHART_DEFAULTS, plugins: { legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 } } } }, scales: { x: { ...axisStyle, title: { display: true, text: 'MAE (R)', color: '#555', font: { family: 'DM Mono', size: 10 } } }, y: { ...axisStyle, title: { display: true, text: 'MFE (R)', color: '#555', font: { family: 'DM Mono', size: 10 } } } } }}
                      />
                    </div>
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <CardTitle>MFE dağılımı — ne kadar hareket görüldü?</CardTitle>
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                    <thead>
                      <tr>{['MFE Zonu', 'Toplam', 'TP Hit', 'TP%', 'Ort. Süre'].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-3)', paddingBottom: 8, fontWeight: 400 }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rmae.mfe_distribution.map((row, i) => {
                        const tpRate = row.total > 0 ? (Number(row.tp_count) / Number(row.total)) * 100 : 0
                        const mins   = Number(row.avg_mins)
                        const dur    = mins ? `${Math.floor(mins / 60)}s ${Math.round(mins % 60)}dk` : '—'
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 0', color: 'var(--text-2)' }}>{row.mfe_bucket}</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--green)' }}>{row.tp_count}</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: winColor(tpRate) }}>{tpRate.toFixed(1)}%</td>
                            <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--text-3)' }}>{dur}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </Section>
            )}
            {/* ── 6. ZAMANLAMA ─────────────────────────────────────────────── */}
            {hourly && hourly.by_analysis?.length > 0 && (() => {
              const series = hourly.by_analysis
              const best = series.filter(h => h.total >= 2).sort((a, b) => Number(b.win_rate) - Number(a.win_rate))[0]
              const barData = {
                labels: series.map(h => `${String(h.hour).padStart(2, '0')}:00`),
                datasets: [
                  { label: 'TP', data: series.map(h => h.tp_count), backgroundColor: 'rgba(74,222,128,0.7)', borderColor: 'rgba(74,222,128,0.9)', borderWidth: 1, borderRadius: 3 },
                  { label: 'SL', data: series.map(h => h.sl_count), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: 'rgba(248,113,113,0.9)', borderWidth: 1, borderRadius: 3 },
                ],
              }
              const barOpts: any = {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    displayColors: false, padding: 10,
                    callbacks: {
                      title: (items: any) => `Saat ${items[0].label}`,
                      afterBody: (items: any) => {
                        const h = series[items[0].dataIndex]
                        if (!h.total) return ['Veri yok']
                        const lines = [`Win Rate: %${h.win_rate}`, `Toplam: ${h.total} (TP: ${h.tp_count} / SL: ${h.sl_count})`]
                        if (h.avg_r_tp != null) lines.push(`Ort. Win R: +${Number(h.avg_r_tp).toFixed(2)}R`)
                        return lines
                      },
                    },
                  },
                },
                scales: {
                  x: { stacked: true, grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 9 } }, border: { color: '#242424' } },
                  y: { stacked: true, grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { family: 'DM Mono', size: 10 }, stepSize: 1 }, border: { color: '#242424' }, min: 0 },
                },
              }
              return (
                <Section title="Zamanlama">
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <CardTitle>Analiz saati → TP/SL dağılımı</CardTitle>
                        <div style={{ display: 'flex', gap: 10, marginTop: -12 }}>
                          {[{ label: 'TP', color: 'var(--green)' }, { label: 'SL', color: 'var(--red)' }].map(x => (
                            <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color }} />
                              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{x.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {best && (
                        <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>
                          En iyi: {String(best.hour).padStart(2, '0')}:00 (%{best.win_rate})
                        </span>
                      )}
                    </div>
                    <div style={{ height: 180 }}>
                      <Bar data={barData} options={barOpts} />
                    </div>
                  </div>
                </Section>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
