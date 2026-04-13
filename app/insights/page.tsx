'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Chart as ChartJS,
  ArcElement, Tooltip, LineElement, PointElement,
  LinearScale, CategoryScale, BarElement, Filler,
} from 'chart.js'
import { Bar, Scatter } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Filler)

// ── types ────────────────────────────────────────────────────────────────────

interface Overview {
  total: number; tp_count: number; sl_count: number
  expired_count: number; no_entry_count: number; pending_count: number
  win_rate: number; avg_r_win: number; avg_r_loss: number
  avg_duration_mins: number; avg_duration_win: number; avg_duration_loss: number
  total_pnl: number; seq_total: number; seq_win_rate: number
  long_total: number; long_win_rate: number
  short_total: number; short_win_rate: number
}

interface ScoringRow { score: number; total: number; wins: number; win_rate: number }
interface RsiRow { rsi_zone: string; total: number; wins: number; win_rate: number }
interface ScoringData { by_score: ScoringRow[]; by_confidence: ScoringRow[]; by_rsi: RsiRow[] }

interface IndicatorRow { indicator: string; sentiment: string; total: number; wins: number; win_rate: number }
interface MtfRow { h1: string; m5: string; mtf: string; total: number; wins: number; win_rate: number }
interface LiqRow { liquidity: string; market_power: string; total: number; wins: number; win_rate: number }
interface SentimentData { indicators: IndicatorRow[]; mtf_confluence: MtfRow[]; liquidity_cross: LiqRow[] }

interface DirSentRow { direction: string; mtf_strength: string; total: number; wins: number; win_rate: number }
interface ScoreSentRow { score_bucket: string; mtf_strength: string; total: number; wins: number; win_rate: number }
interface TopPairRow { pair_name: string; combination: string; total: number; wins: number; win_rate: number }
interface PairsData { direction_x_sentiment: DirSentRow[]; score_x_sentiment: ScoreSentRow[]; top_pairs: TopPairRow[] }

interface RHistRow { sim_result: string; r_bucket: number; count: number }
interface ScatterRow { id: number; sim_result: string; mfe: number; mae: number; r_multiple: number; score: number }
interface MfeRow { mfe_bucket: string; total: number; tp_count: number; avg_mins: number }
interface RmaeData { r_histogram: RHistRow[]; scatter: ScatterRow[]; mfe_distribution: MfeRow[] }

// ── helpers ──────────────────────────────────────────────────────────────────

const N = (v: any, d = 1) => v == null ? '—' : Number(v).toFixed(d)
const pct = (v: any) => v == null ? '—' : `%${Number(v).toFixed(1)}`
const winColor = (v: number | null) => {
  if (v == null) return 'var(--text-3)'
  if (v >= 60) return 'var(--green)'
  if (v >= 45) return 'var(--amber)'
  return 'var(--red)'
}
const sentLabel = (s: string) => {
  if (s === 'bullish') return { label: 'bullish', color: 'var(--green)' }
  if (s === 'bearish') return { label: 'bearish', color: 'var(--red)' }
  if (s === 'buying_pressure') return { label: 'buying', color: 'var(--green)' }
  if (s === 'selling_pressure') return { label: 'selling', color: 'var(--red)' }
  if (s === 'strong') return { label: 'strong', color: 'var(--green)' }
  if (s === 'weak') return { label: 'weak', color: 'var(--red)' }
  return { label: s, color: 'var(--amber)' }
}

const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
}

const axisStyle = {
  grid: { color: '#1a1a1a' },
  ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } },
  border: { color: '#242424' },
}

// ── section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="section-title" style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  )
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="stat-card">
      <div className="col-label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}

// ── win rate bar ──────────────────────────────────────────────────────────────

function WinBar({ rate, total }: { rate: number | null; total: number }) {
  const pct = rate ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: winColor(rate), borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: winColor(rate), minWidth: 42, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', minWidth: 28, textAlign: 'right' }}>n={total}</span>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [overview, setOverview]   = useState<Overview | null>(null)
  const [scoring, setScoring]     = useState<ScoringData | null>(null)
  const [sentiment, setSentiment] = useState<SentimentData | null>(null)
  const [pairs, setPairs]         = useState<PairsData | null>(null)
  const [rmae, setRmae]           = useState<RmaeData | null>(null)
  const [loading, setLoading]     = useState(true)

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/insights-overview', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-scoring',  { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-sentiment',{ cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-pairs',    { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/insights-rmae',     { cache: 'no-store' }).then(r => r.json()),
    ]).then(([ov, sc, se, pa, rm]) => {
      setOverview(ov); setScoring(sc); setSentiment(se); setPairs(pa); setRmae(rm)
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

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 64 }}>
      <div className="container" style={{ paddingTop: 24 }}>

        {loading && (
          <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-3)' }} className="mono">
            yükleniyor...
          </div>
        )}

        {!loading && overview && (
          <>
            {/* ── 1. OVERVIEW ─────────────────────────────────────────────── */}
            <Section title="Genel Bakış">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
                <StatCard label="Win Rate" value={pct(overview.win_rate)} color={Number(overview.win_rate) >= 50 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Toplam PnL" value={overview.total_pnl != null ? `${overview.total_pnl > 0 ? '+' : ''}$${Math.abs(Number(overview.total_pnl)).toFixed(2)}` : '—'} color={Number(overview.total_pnl) > 0 ? 'var(--green)' : 'var(--red)'} />
                <StatCard label="Ort. Win R" value={overview.avg_r_win != null ? `+${N(overview.avg_r_win)}R` : '—'} color="var(--green)" />
                <StatCard label="Ort. Loss R" value={overview.avg_r_loss != null ? `${N(overview.avg_r_loss)}R` : '—'} color="var(--red)" />
                <StatCard label="Ort. Süre" value={overview.avg_duration_mins != null ? `${Math.round(Number(overview.avg_duration_mins) / 60)}s ${Math.round(Number(overview.avg_duration_mins) % 60)}dk` : '—'} />
                <StatCard label="TP Hit" value={overview.tp_count} color="var(--green)" />
                <StatCard label="SL Hit" value={overview.sl_count} color="var(--red)" />
                <StatCard label="Expired" value={overview.expired_count} color="var(--amber)" />
              </div>

              <div className="charts-2col">
                <div className="card" style={{ padding: 16 }}>
                  <div className="col-label" style={{ marginBottom: 10 }}>Yön bazında win rate</div>
                  {[
                    { label: 'LONG', rate: overview.long_win_rate, total: overview.long_total, color: 'var(--green)' },
                    { label: 'SHORT', rate: overview.short_win_rate, total: overview.short_total, color: 'var(--red)' },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, color: row.color }}>{row.label}</span>
                      </div>
                      <WinBar rate={Number(row.rate)} total={row.total} />
                    </div>
                  ))}
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="col-label" style={{ marginBottom: 10 }}>Sequential vs tüm tradeler</div>
                  {[
                    { label: 'Tüm tradeler', rate: Number(overview.win_rate), total: Number(overview.tp_count) + Number(overview.sl_count) },
                    { label: 'Sequential', rate: Number(overview.seq_win_rate), total: Number(overview.seq_total) },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 10 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{row.label}</span>
                      </div>
                      <WinBar rate={row.rate} total={row.total} />
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── 2. SCORING ──────────────────────────────────────────────── */}
            {scoring && (
              <Section title="Skor Analizi">
                <div className="charts-2col" style={{ marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 8 }}>Market score → win rate</div>
                    <div style={{ height: 140 }}>
                      <Bar
                        data={{
                          labels: scoring.by_score.map(r => `${r.score}`),
                          datasets: [
                            {
                              label: 'Win Rate %',
                              data: scoring.by_score.map(r => Number(r.win_rate)),
                              backgroundColor: scoring.by_score.map(r => Number(r.win_rate) >= 60 ? 'rgba(74,222,128,0.4)' : Number(r.win_rate) >= 45 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'),
                              borderColor: scoring.by_score.map(r => Number(r.win_rate) >= 60 ? '#4ade80' : Number(r.win_rate) >= 45 ? '#fbbf24' : '#f87171'),
                              borderWidth: 1,
                            },
                          ],
                        }}
                        options={{
                          ...CHART_DEFAULTS,
                          scales: {
                            x: axisStyle,
                            y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } },
                          },
                        }}
                      />
                    </div>
                  </div>

                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 8 }}>Confidence → win rate</div>
                    <div style={{ height: 140 }}>
                      <Bar
                        data={{
                          labels: scoring.by_confidence.map(r => `${r.score}`),
                          datasets: [
                            {
                              label: 'Win Rate %',
                              data: scoring.by_confidence.map(r => Number(r.win_rate)),
                              backgroundColor: scoring.by_confidence.map(r => Number(r.win_rate) >= 60 ? 'rgba(74,222,128,0.4)' : Number(r.win_rate) >= 45 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)'),
                              borderColor: scoring.by_confidence.map(r => Number(r.win_rate) >= 60 ? '#4ade80' : Number(r.win_rate) >= 45 ? '#fbbf24' : '#f87171'),
                              borderWidth: 1,
                            },
                          ],
                        }}
                        options={{
                          ...CHART_DEFAULTS,
                          scales: {
                            x: axisStyle,
                            y: { ...axisStyle, max: 100, ticks: { ...axisStyle.ticks, callback: (v: any) => `${v}%` } },
                          },
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="col-label" style={{ marginBottom: 10 }}>RSI 4H zonu → win rate</div>
                  {scoring.by_rsi.map(row => (
                    <div key={row.rsi_zone} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{row.rsi_zone}</span>
                      </div>
                      <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── 3. SENTIMENT ────────────────────────────────────────────── */}
            {sentiment && (
              <Section title="Sentiment Analizi">
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div className="col-label" style={{ marginBottom: 12 }}>İndikatör × sentiment → win rate</div>
                  {(() => {
                    const grouped: Record<string, IndicatorRow[]> = {}
                    sentiment.indicators.forEach(r => {
                      if (!grouped[r.indicator]) grouped[r.indicator] = []
                      grouped[r.indicator].push(r)
                    })
                    return Object.entries(grouped).map(([indicator, rows]) => (
                      <div key={indicator} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>{indicator}</div>
                        {rows.filter(r => r.sentiment).map(row => {
                          const sl = sentLabel(row.sentiment)
                          return (
                            <div key={row.sentiment} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span className="mono" style={{ fontSize: 11, color: sl.color, minWidth: 80 }}>{sl.label}</span>
                              <div style={{ flex: 1 }}>
                                <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))
                  })()}
                </div>

                <div className="charts-2col">
                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 10 }}>MTF synthesis kombinasyonları</div>
                    {sentiment.mtf_confluence.slice(0, 8).map((row, i) => {
                      const label = `H1:${row.h1} M5:${row.m5} MTF:${row.mtf}`
                      return (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>{label}</span>
                          <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                        </div>
                      )
                    })}
                  </div>

                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 10 }}>Liquidity × market power</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Liquidity</th>
                          <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Mkt Power</th>
                          <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>n</th>
                          <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Win%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sentiment.liquidity_cross.map((row, i) => {
                          const liq = sentLabel(row.liquidity)
                          const mkt = sentLabel(row.market_power)
                          return (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '5px 0', color: liq.color }}>{liq.label}</td>
                              <td style={{ padding: '5px 0', color: mkt.color }}>{mkt.label}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', color: winColor(Number(row.win_rate)) }}>{Number(row.win_rate).toFixed(1)}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Section>
            )}

            {/* ── 4. PAIRS ────────────────────────────────────────────────── */}
            {pairs && (
              <Section title="Değişken Çiftleri">
                <div className="charts-2col" style={{ marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 10 }}>Direction × MTF synthesis</div>
                    {['LONG', 'SHORT'].map(dir => (
                      <div key={dir} style={{ marginBottom: 12 }}>
                        <span className="mono" style={{ fontSize: 11, color: dir === 'LONG' ? 'var(--green)' : 'var(--red)', display: 'block', marginBottom: 4 }}>{dir}</span>
                        {pairs.direction_x_sentiment
                          .filter(r => r.direction === dir)
                          .map(row => {
                            const sl = sentLabel(row.mtf_strength)
                            return (
                              <div key={row.mtf_strength} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 50 }}>{sl.label}</span>
                                <div style={{ flex: 1 }}>
                                  <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    ))}
                  </div>

                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 10 }}>Score bucket × MTF synthesis</div>
                    {['Yüksek (8-10)', 'Orta (5-7)', 'Düşük (1-4)'].map(bucket => (
                      <div key={bucket} style={{ marginBottom: 12 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>{bucket}</span>
                        {pairs.score_x_sentiment
                          .filter(r => r.score_bucket === bucket)
                          .map(row => {
                            const sl = sentLabel(row.mtf_strength)
                            return (
                              <div key={row.mtf_strength} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                <span className="mono" style={{ fontSize: 10, color: sl.color, minWidth: 50 }}>{sl.label}</span>
                                <div style={{ flex: 1 }}>
                                  <WinBar rate={Number(row.win_rate)} total={Number(row.total)} />
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="col-label" style={{ marginBottom: 10 }}>En güçlü 10 kombinasyon (min 5 trade)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>#</th>
                        <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Pair</th>
                        <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Kombinasyon</th>
                        <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>n</th>
                        <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Win%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.top_pairs.map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 0', color: 'var(--text-3)' }}>{i + 1}</td>
                          <td style={{ padding: '5px 0', color: 'var(--text-3)', fontSize: 10 }}>{row.pair_name}</td>
                          <td style={{ padding: '5px 0', color: 'var(--text-2)' }}>{row.combination}</td>
                          <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                          <td style={{ padding: '5px 0', textAlign: 'right', color: winColor(Number(row.win_rate)), fontWeight: 500 }}>{Number(row.win_rate).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── 5. R / MFE / MAE ────────────────────────────────────────── */}
            {rmae && (
              <Section title="R Multiple & MFE/MAE">
                <div className="charts-2col" style={{ marginBottom: 12 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 8 }}>R multiple dağılımı</div>
                    <div style={{ height: 160 }}>
                      {(() => {
                        const buckets = [...new Set(rmae.r_histogram.map(r => r.r_bucket))].sort((a, b) => a - b)
                        const tpData  = buckets.map(b => rmae.r_histogram.find(r => r.r_bucket === b && r.sim_result === 'TP_HIT')?.count ?? 0)
                        const slData  = buckets.map(b => rmae.r_histogram.find(r => r.r_bucket === b && r.sim_result === 'SL_HIT')?.count ?? 0)
                        return (
                          <Bar
                            data={{
                              labels: buckets.map(b => `${b > 0 ? '+' : ''}${b}R`),
                              datasets: [
                                { label: 'TP', data: tpData, backgroundColor: 'rgba(74,222,128,0.4)', borderColor: '#4ade80', borderWidth: 1 },
                                { label: 'SL', data: slData, backgroundColor: 'rgba(248,113,113,0.4)', borderColor: '#f87171', borderWidth: 1 },
                              ],
                            }}
                            options={{
                              ...CHART_DEFAULTS,
                              plugins: { legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 } } } },
                              scales: { x: axisStyle, y: { ...axisStyle, ticks: { ...axisStyle.ticks, stepSize: 1 } } },
                            }}
                          />
                        )
                      })()}
                    </div>
                  </div>

                  <div className="card" style={{ padding: 16 }}>
                    <div className="col-label" style={{ marginBottom: 8 }}>MFE vs MAE scatter</div>
                    <div style={{ height: 160 }}>
                      <Scatter
                        data={{
                          datasets: [
                            {
                              label: 'TP',
                              data: rmae.scatter.filter(r => r.sim_result === 'TP_HIT').map(r => ({ x: r.mae, y: r.mfe })),
                              backgroundColor: 'rgba(74,222,128,0.5)',
                              pointRadius: 3,
                            },
                            {
                              label: 'SL',
                              data: rmae.scatter.filter(r => r.sim_result === 'SL_HIT').map(r => ({ x: r.mae, y: r.mfe })),
                              backgroundColor: 'rgba(248,113,113,0.5)',
                              pointRadius: 3,
                            },
                          ],
                        }}
                        options={{
                          ...CHART_DEFAULTS,
                          plugins: { legend: { display: true, labels: { color: '#555', font: { family: 'DM Mono', size: 10 } } } },
                          scales: {
                            x: { ...axisStyle, title: { display: true, text: 'MAE (R)', color: '#555', font: { family: 'DM Mono', size: 10 } } },
                            y: { ...axisStyle, title: { display: true, text: 'MFE (R)', color: '#555', font: { family: 'DM Mono', size: 10 } } },
                          },
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="col-label" style={{ marginBottom: 10 }}>MFE dağılımı — ne kadar hareket görüldü?</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>MFE Zonu</th>
                        <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Toplam</th>
                        <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>TP Hit</th>
                        <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>TP%</th>
                        <th style={{ textAlign: 'right', color: 'var(--text-3)', paddingBottom: 6, fontWeight: 400 }}>Ort. Süre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rmae.mfe_distribution.map((row, i) => {
                        const tpRate = row.total > 0 ? (Number(row.tp_count) / Number(row.total)) * 100 : 0
                        const mins   = Number(row.avg_mins)
                        const dur    = mins ? `${Math.floor(mins / 60)}s ${Math.round(mins % 60)}dk` : '—'
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '5px 0', color: 'var(--text-2)' }}>{row.mfe_bucket}</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>{row.total}</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--green)' }}>{row.tp_count}</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', color: winColor(tpRate) }}>{tpRate.toFixed(1)}%</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)' }}>{dur}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
