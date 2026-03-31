'use client'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

const AnalysisModal = dynamic(() => import('@/components/AnalysisModal'), { ssr: false })

interface AnalysisSummary {
  id: number
  analyzed_at: string
  direction: string
  order_type: string
  entry: number
  tp: number
  sl: number
  rr: string
  market_score_value: number
  confidence_value: number
  sim_result: string
  sim_pnl_usd: number
  sim_entry_to_result_minutes: number
  risk_usd: number
  position_size_btc: number
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

function dirBadge(d: string) {
  if (d === 'SHORT') return <span className="badge badge-short">SHORT</span>
  if (d === 'LONG') return <span className="badge badge-long">LONG</span>
  return <span className="badge badge-wait">WAIT</span>
}

function resultBadge(r: string) {
  if (!r) return <span className="badge badge-pend">BEKL.</span>
  if (r === 'TP_HIT') return <span className="badge badge-tp">TP HIT</span>
  if (r === 'SL_HIT') return <span className="badge badge-sl">SL HIT</span>
  if (r === 'EXPIRED') return <span className="badge badge-exp">EXPIRED</span>
  return <span className="badge badge-ne">NO ENTRY</span>
}

function pnlClass(v: number) {
  if (v > 0) return 'pnl-pos'
  if (v < 0) return 'pnl-neg'
  return 'pnl-zero'
}

function fmt(n: number) {
  return n?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '—'
}

function fmtDate(s: string) {
  const d = new Date(s)
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dirFilter, setDirFilter] = useState('ALL')
  const [resultFilter, setResultFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchAnalyses = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      direction: dirFilter,
      result: resultFilter,
      page: String(page),
    })
    fetch(`/api/analyses?${params}`)
      .then(r => r.json())
      .then(d => {
        setAnalyses(d.analyses)
        setTotalPages(d.totalPages)
        setTotal(d.total)
        setLoading(false)
      })
  }, [dirFilter, resultFilter, page])

  useEffect(() => { fetchAnalyses() }, [fetchAnalyses])
  useEffect(() => { fetch('/api/dashboard').then(r => r.json()).then(setStats) }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>HAKARI</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 16, borderLeft: '1px solid var(--border)' }}>BTC/USDT MTF</span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div style={{ padding: '32px 32px 0' }}>
        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 32 }}>
            {[
              { label: 'Toplam', value: stats.total, sub: null },
              { label: 'Win Rate', value: stats.win_rate ? `%${stats.win_rate}` : '—', sub: null },
              { label: 'TP Hit', value: stats.tp_count, sub: null, color: 'var(--green)' },
              { label: 'SL Hit', value: stats.sl_count, sub: null, color: 'var(--red)' },
              { label: 'Expired', value: stats.expired_count, sub: null, color: 'var(--amber)' },
              { label: 'Toplam PnL', value: stats.total_pnl != null ? `${stats.total_pnl > 0 ? '+' : ''}$${Math.abs(stats.total_pnl).toFixed(2)}` : '—', sub: null, color: stats.total_pnl > 0 ? 'var(--green)' : stats.total_pnl < 0 ? 'var(--red)' : undefined },
              { label: 'Ort. Güven', value: stats.avg_confidence ? `%${stats.avg_confidence}` : '—', sub: null },
              { label: 'Ort. Skor', value: stats.avg_score ? `${stats.avg_score}/10` : '—', sub: null },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <div className="col-label" style={{ marginBottom: 8 }}>{s.label}</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: (s as any).color || 'var(--text)' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <span className="col-label" style={{ marginRight: 4 }}>Yön:</span>
          {['ALL', 'SHORT', 'LONG', 'WAIT'].map(d => (
            <button key={d} className={`filter-btn${dirFilter === d ? ' active' : ''}`}
              onClick={() => { setDirFilter(d); setPage(1) }}>{d}</button>
          ))}
          <span className="col-label" style={{ marginLeft: 16, marginRight: 4 }}>Sonuç:</span>
          {['ALL', 'TP_HIT', 'SL_HIT', 'EXPIRED', 'NO_ENTRY'].map(r => (
            <button key={r} className={`filter-btn${resultFilter === r ? ' active' : ''}`}
              onClick={() => { setResultFilter(r); setPage(1) }}>{r}</button>
          ))}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{total} kayıt</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 32px 32px' }}>
        <div className="card">
          {/* Header */}
          <div className="row-item" style={{ cursor: 'default', borderBottom: '1px solid var(--border-2)' }} onClick={undefined}>
            <span className="col-label">Tarih</span>
            <span className="col-label">Yön</span>
            <span className="col-label">Giriş</span>
            <span className="col-label">TP</span>
            <span className="col-label">SL</span>
            <span className="col-label">R/R</span>
            <span className="col-label">Skor</span>
            <span className="col-label">Sonuç</span>
            <span className="col-label">PnL</span>
          </div>

          {loading && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }} className="mono">yükleniyor...</div>
          )}

          {!loading && analyses.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }} className="mono">kayıt bulunamadı</div>
          )}

          {!loading && analyses.map(a => (
            <div key={a.id} className="row-item" onClick={() => setSelectedId(a.id)}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtDate(a.analyzed_at)}</span>
              <span>{dirBadge(a.direction)}</span>
              <span className="price">${fmt(a.entry)}</span>
              <span className="price" style={{ color: 'var(--green)' }}>${fmt(a.tp)}</span>
              <span className="price" style={{ color: 'var(--red)' }}>${fmt(a.sl)}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.rr}</span>
              <span className="mono" style={{ fontSize: 12 }}>{a.market_score_value}/10 <span style={{ color: 'var(--text-3)' }}>%{a.confidence_value}</span></span>
              <span>{resultBadge(a.sim_result)}</span>
              <span className={`mono ${a.sim_pnl_usd != null ? pnlClass(a.sim_pnl_usd) : 'pnl-zero'}`} style={{ fontSize: 13 }}>
                {a.sim_pnl_usd != null
                  ? `${a.sim_pnl_usd > 0 ? '+' : ''}$${Math.abs(a.sim_pnl_usd).toFixed(2)}`
                  : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="filter-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Önceki</button>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)', padding: '5px 12px' }}>{page} / {totalPages}</span>
            <button className="filter-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Sonraki →</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedId && (
        <AnalysisModal id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
