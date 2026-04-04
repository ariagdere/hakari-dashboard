'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip)

interface AnalysisSummary {
  id: number
  analyzed_at: string
  direction: string
  entry: number
  tp: number
  sl: number
  rr: string
  market_score_value: number
  confidence_value: number
  sim_result: string
  sim_pnl_usd: number
  sim_r_multiple: number
}

interface Stats {
  total: number
  tp_count: number
  sl_count: number
  expired_count: number
  no_entry_count: number
  pending_count: number
  avg_pnl: number
  total_pnl: number
  win_rate: number
  short_count: number
  long_count: number
  avg_confidence: number
  avg_score: number
}

const dirBadge = (d: string) => {
  if (d === 'SHORT') return <span className="badge badge-short">SHORT</span>
  if (d === 'LONG') return <span className="badge badge-long">LONG</span>
  return <span className="badge badge-wait">WAIT</span>
}

const resultBadge = (r: string) => {
  if (!r) return <span className="badge badge-pend">BEKL.</span>
  if (r === 'TP_HIT') return <span className="badge badge-tp">TP</span>
  if (r === 'SL_HIT') return <span className="badge badge-sl">SL</span>
  if (r === 'EXPIRED') return <span className="badge badge-exp">EXP</span>
  return <span className="badge badge-ne">N/E</span>
}

const pnlClass = (v: number) => v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'pnl-zero'
const fmt = (n: number) => n?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '—'
const fmtDate = (s: string) => new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtR = (v: number | null, result?: string) => {
  if (v == null) return '—'
  const signed = result === 'SL_HIT' ? -Math.abs(v) : result === 'TP_HIT' ? Math.abs(v) : v
  return (signed > 0 ? '+' : '') + signed.toFixed(2) + 'R'
}

export default function Dashboard() {
  const router = useRouter()
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dirFilter, setDirFilter] = useState('ALL')
  const [resultFilter, setResultFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchAnalyses = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ direction: dirFilter, result: resultFilter, page: String(page) })
    Promise.all([
      fetch(`/api/analyses?${params}`).then(r => r.json()),
      fetch('/api/dashboard').then(r => r.json()),
    ]).then(([d, s]) => {
      setAnalyses(d.analyses)
      setTotalPages(d.totalPages)
      setTotal(d.total)
      setStats(s)
      setLoading(false)
    })
  }, [dirFilter, resultFilter, page])

  useEffect(() => { fetchAnalyses() }, [fetchAnalyses])

  // Sekmeye geri dönüldüğünde yenile
  useEffect(() => {
    const onFocus = () => fetchAnalyses()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchAnalyses() })
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchAnalyses])

  const chartOpts: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '68%' }

  const dirChart = stats ? {
    labels: ['SHORT', 'LONG'],
    datasets: [{ data: [stats.short_count, stats.long_count], backgroundColor: ['#f8717133', '#4ade8033'], borderColor: ['#f87171', '#4ade80'], borderWidth: 1.5 }]
  } : null

  const resultChart = stats ? {
    labels: ['TP', 'SL', 'Expired', 'No Entry'],
    datasets: [{ data: [stats.tp_count, stats.sl_count, stats.expired_count, stats.no_entry_count], backgroundColor: ['#4ade8033', '#f8717133', '#fbbf2433', '#ffffff11'], borderColor: ['#4ade80', '#f87171', '#fbbf24', '#555'], borderWidth: 1.5 }]
  } : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 48 }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
        <div className="container" style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginRight: 14 }}>HAKARI</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text)', padding: '4px 12px', borderLeft: '1px solid var(--border)', letterSpacing: '0.06em', borderBottom: '2px solid var(--text)' }}>ANALİZ</span>
            <Link
              href="/mkt"
              style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', textDecoration: 'none', letterSpacing: '0.06em', transition: 'color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              MKT
            </Link>
            <Link
              href="/ops"
              style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', textDecoration: 'none', letterSpacing: '0.06em', transition: 'color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              OPS
            </Link>
          </div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 24 }}>
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 20 }}>
            {[
              { label: 'Toplam', value: stats.total, color: 'var(--text)' },
              { label: 'Win Rate', value: stats.win_rate ? `%${stats.win_rate}` : '—', color: Number(stats.win_rate ?? 0) >= 50 ? 'var(--green)' : 'var(--red)' },
              { label: 'TP Hit', value: stats.tp_count, color: 'var(--green)' },
              { label: 'SL Hit', value: stats.sl_count, color: 'var(--red)' },
              { label: 'Expired', value: stats.expired_count, color: 'var(--amber)' },
              { label: 'No Entry', value: stats.no_entry_count, color: 'var(--text-2)' },
              { label: 'Bekleyen', value: stats.pending_count, color: 'var(--text-3)' },
              { label: 'Toplam PnL', value: stats.total_pnl != null ? `${stats.total_pnl > 0 ? '+' : ''}$${Math.abs(stats.total_pnl).toFixed(2)}` : '—', color: stats.total_pnl > 0 ? 'var(--green)' : stats.total_pnl < 0 ? 'var(--red)' : 'var(--text)' },
              { label: 'Ort. PnL', value: stats.avg_pnl != null ? `${stats.avg_pnl > 0 ? '+' : ''}$${Math.abs(stats.avg_pnl).toFixed(2)}` : '—', color: Number(stats.avg_pnl ?? 0) > 0 ? 'var(--green)' : 'var(--red)' },
              { label: 'Ort. Güven', value: stats.avg_confidence ? `%${stats.avg_confidence}` : '—', color: 'var(--text)' },
              { label: 'Ort. Skor', value: stats.avg_score ? `${stats.avg_score}/10` : '—', color: 'var(--text)' },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <div className="col-label" style={{ marginBottom: 6 }}>{s.label}</div>
                <div className="mono" style={{ fontSize: 17, fontWeight: 500, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {stats && (
          <div className="charts-2col" style={{ marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>Yön Dağılımı</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
                  {dirChart && <Doughnut data={dirChart} options={chartOpts} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[{ label: 'SHORT', val: stats.short_count, color: 'var(--red)' }, { label: 'LONG', val: stats.long_count, color: 'var(--green)' }].map((x, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: x.color, flexShrink: 0 }}></span>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{x.label}</span>
                      <span className="mono" style={{ fontSize: 14, color: x.color, marginLeft: 'auto' }}>{x.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>Sonuç Dağılımı</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
                  {resultChart && <Doughnut data={resultChart} options={chartOpts} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'TP Hit', val: stats.tp_count, color: 'var(--green)' },
                    { label: 'SL Hit', val: stats.sl_count, color: 'var(--red)' },
                    { label: 'Expired', val: stats.expired_count, color: 'var(--amber)' },
                    { label: 'No Entry', val: stats.no_entry_count, color: 'var(--text-3)' },
                  ].map((x, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: x.color, flexShrink: 0 }}></span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{x.label}</span>
                      <span className="mono" style={{ fontSize: 13, color: x.color, marginLeft: 'auto' }}>{x.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap', overflowX: 'auto', paddingBottom: 2 }}>
          <span className="col-label" style={{ marginRight: 2 }}>Yön:</span>
          {['ALL', 'SHORT', 'LONG'].map(d => (
            <button key={d} className={`filter-btn${dirFilter === d ? ' active' : ''}`} onClick={() => { setDirFilter(d); setPage(1) }}>{d}</button>
          ))}
          <span className="col-label" style={{ marginLeft: 10, marginRight: 2 }}>Sonuç:</span>
          {['ALL', 'TP_HIT', 'SL_HIT', 'EXPIRED', 'NO_ENTRY'].map(r => (
            <button key={r} className={`filter-btn${resultFilter === r ? ' active' : ''}`} onClick={() => { setResultFilter(r); setPage(1) }}>{r}</button>
          ))}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{total} kayıt</span>
        </div>

        <div className="card">
          <div className="row-item" style={{ cursor: 'default' }}>
            <span className="col-label">Tarih</span>
            <span className="col-label">Yön</span>
            <span className="col-label">Giriş</span>
            <span className="col-label">TP</span>
            <span className="col-label">SL</span>
            <span className="col-label">R/R</span>
            <span className="col-label">Skor</span>
            <span className="col-label">Güven</span>
            <span className="col-label">Sonuç</span>
            <span className="col-label">PnL</span>
            <span className="col-label">R</span>
          </div>

          {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">yükleniyor...</div>}
          {!loading && analyses.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }} className="mono">kayıt bulunamadı</div>}

          {!loading && analyses.map(a => (
            <div key={`d-${a.id}`} className="row-item" onClick={() => router.push(`/dashboard/${a.id}`)}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtDate(a.analyzed_at)}</span>
              <span>{dirBadge(a.direction)}</span>
              <span className="price">${fmt(a.entry)}</span>
              <span className="price" style={{ color: 'var(--green)' }}>${fmt(a.tp)}</span>
              <span className="price" style={{ color: 'var(--red)' }}>${fmt(a.sl)}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.rr}</span>
              <span className="mono" style={{ fontSize: 12 }}>{a.market_score_value}/10</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>%{a.confidence_value}</span>
              <span>{resultBadge(a.sim_result)}</span>
              <span className={`mono ${a.sim_pnl_usd != null ? pnlClass(a.sim_pnl_usd) : 'pnl-zero'}`} style={{ fontSize: 12 }}>
                {a.sim_pnl_usd != null ? `${a.sim_pnl_usd > 0 ? '+' : ''}$${Math.abs(a.sim_pnl_usd).toFixed(2)}` : '—'}
              </span>
              <span className={`mono ${a.sim_r_multiple != null ? pnlClass(a.sim_result === 'SL_HIT' ? -1 : a.sim_r_multiple) : 'pnl-zero'}`} style={{ fontSize: 12 }}>
                {fmtR(a.sim_r_multiple, a.sim_result)}
              </span>
            </div>
          ))}

          {!loading && analyses.map(a => (
            <div key={`m-${a.id}`} className="mobile-card" onClick={() => router.push(`/dashboard/${a.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dirBadge(a.direction)}
                  {resultBadge(a.sim_result)}
                </div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{fmtDate(a.analyzed_at)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div className="col-label" style={{ marginBottom: 3 }}>Giriş</div>
                  <div className="price" style={{ fontSize: 13 }}>${fmt(a.entry)}</div>
                </div>
                <div>
                  <div className="col-label" style={{ marginBottom: 3 }}>TP</div>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--green)' }}>${fmt(a.tp)}</div>
                </div>
                <div>
                  <div className="col-label" style={{ marginBottom: 3 }}>SL</div>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--red)' }}>${fmt(a.sl)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <span className="col-label">R/R </span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.rr}</span>
                </div>
                <div>
                  <span className="col-label">Skor </span>
                  <span className="mono" style={{ fontSize: 12 }}>{a.market_score_value}/10</span>
                </div>
                <div>
                  <span className="col-label">Güven </span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>%{a.confidence_value}</span>
                </div>
                {a.sim_pnl_usd != null && (
                  <div style={{ marginLeft: 'auto' }}>
                    <span className={`mono ${pnlClass(a.sim_pnl_usd)}`} style={{ fontSize: 13, fontWeight: 500 }}>
                      {a.sim_pnl_usd > 0 ? '+' : ''}${Math.abs(a.sim_pnl_usd).toFixed(2)}
                    </span>
                    <span className={`mono ${a.sim_r_multiple != null ? pnlClass(a.sim_result === 'SL_HIT' ? -1 : a.sim_r_multiple) : 'pnl-zero'}`} style={{ fontSize: 11, marginLeft: 6 }}>
                      {fmtR(a.sim_r_multiple, a.sim_result)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="filter-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Önceki</button>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 12px' }}>{page} / {totalPages}</span>
            <button className="filter-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Sonraki →</button>
          </div>
        )}
      </div>
    </div>
  )
}
