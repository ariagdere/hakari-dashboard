'use client'
import { useState, useEffect, useRef } from 'react'

// API route'undan gelen state'in client tarafindaki yapisal karsiligi --
// route.ts'ten import EDILMEZ (server-only modul), htfZlema.ts<->fvgEngine.ts
// arasindaki AYNI ayristirma prensibi.
interface SimMetricsLite {
  totalTrades: number
  winRate: number
  totalR: number
  maxDD: number
}
interface SearchResultItem {
  rank: number
  params: Record<string, unknown>
  isMetrics: SimMetricsLite
  isScore: number
  oosMetrics: SimMetricsLite
  oosScore: number
  overfitWarning: boolean
  insufficientOosData: boolean
}
interface SearchState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: { completed: number; total: number; phase: 'is' | 'oos' | null }
  results: SearchResultItem[] | null
  error: string | null
  periodInfo: { globalMin: number; globalMax: number; isEndTime: number; oosStartTime: number } | null
}

function fmtDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

function ScoreCell({ label, m, score }: { label: string; m: SimMetricsLite; score: number }) {
  return (
    <div style={{ fontSize: 10.5, lineHeight: 1.6 }}>
      <div style={{ color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ color: 'var(--text-2)' }}>
        n={m.totalTrades} WR=%{(m.winRate * 100).toFixed(1)}
      </div>
      <div className="mono" style={{ color: m.totalR >= 0 ? 'var(--green)' : 'var(--red)' }}>
        R={m.totalR.toFixed(2)} DD={m.maxDD.toFixed(2)}
      </div>
      <div className="mono" style={{ color: 'var(--text-2)' }}>
        Skor={score === -Infinity ? 'N/A' : score.toFixed(2)}
      </div>
    </div>
  )
}

export default function FvgLabParamSearch({ onApplyParams }: { onApplyParams?: (p: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false)
  const [nTrials, setNTrials] = useState(300)
  const [topK, setTopK] = useState(15)
  const [minTrades, setMinTrades] = useState(30)
  const [state, setState] = useState<SearchState>({ status: 'idle', progress: { completed: 0, total: 0, phase: null }, results: null, error: null, periodInfo: null })
  const [expandedRank, setExpandedRank] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function poll() {
    try {
      const res = await fetch('/api/fvg-lab/param-search')
      const data: SearchState = await res.json()
      setState(data)
      if (data.status !== 'running' && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch {
      // Bir sonraki pollde tekrar denenir
    }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function start() {
    try {
      const res = await fetch('/api/fvg-lab/param-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nTrials, topK, minTrades }),
      })
      if (res.status === 409) {
        // Zaten calisiyor -- sadece pollinge devam et
        if (!pollRef.current) pollRef.current = setInterval(poll, 3000)
        return
      }
      setState((s) => ({ ...s, status: 'running', results: null, error: null, progress: { completed: 0, total: nTrials, phase: 'is' } }))
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(poll, 3000)
      poll()
    } catch (err: any) {
      setState((s) => ({ ...s, status: 'error', error: String(err?.message || err) }))
    }
  }

  return (
    <div style={{ marginTop: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-2)', fontSize: 12, fontWeight: 500 }}>
        <span style={{ display: 'inline-block', fontSize: 9, color: 'var(--text-3)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
        Parametre Arama (Rastgele Arama + IS/OOS Doğrulama)
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
            Mevcut mum verisi kronolojik %70 IS / %30 OOS bölünür. 34 parametrenin tamamına aynı anda rastgele değer atanan
            denemeler IS üzerinde Risk-Ayarlı Skora (Toplam R / |Max DD|) göre sıralanır; en iyi N tanesi OOS üzerinde ayrıca
            doğrulanır.
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              Deneme sayısı
              <input type="number" value={nTrials} min={10} max={2000} disabled={state.status === 'running'}
                onChange={(e) => setNTrials(Number(e.target.value))} className="mono"
                style={{ display: 'block', width: 90, marginTop: 4, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, padding: '5px 7px', borderRadius: 4 }} />
            </label>
            <label style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              Top-K
              <input type="number" value={topK} min={1} max={50} disabled={state.status === 'running'}
                onChange={(e) => setTopK(Number(e.target.value))} className="mono"
                style={{ display: 'block', width: 70, marginTop: 4, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, padding: '5px 7px', borderRadius: 4 }} />
            </label>
            <label style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              Min. trade/deneme
              <input type="number" value={minTrades} min={5} disabled={state.status === 'running'}
                onChange={(e) => setMinTrades(Number(e.target.value))} className="mono"
                style={{ display: 'block', width: 90, marginTop: 4, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, padding: '5px 7px', borderRadius: 4 }} />
            </label>
            <button onClick={start} disabled={state.status === 'running'}
              style={{
                background: state.status === 'running' ? 'var(--bg-3)' : 'var(--amber)', color: state.status === 'running' ? 'var(--text-3)' : '#000',
                border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 11, fontWeight: 500,
                cursor: state.status === 'running' ? 'default' : 'pointer',
              }}>
              {state.status === 'running' ? 'Çalışıyor…' : 'Aramayı Başlat'}
            </button>
          </div>

          {state.status === 'running' && (
            <div style={{ fontSize: 11, color: 'var(--text-2)' }} className="mono">
              {state.progress.phase === 'is' ? 'IS taraması' : 'OOS doğrulaması'}: {state.progress.completed}/{state.progress.total}
              <div style={{ marginTop: 6, height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden', maxWidth: 360 }}>
                <div style={{ height: '100%', background: 'var(--amber)', width: `${state.progress.total > 0 ? (state.progress.completed / state.progress.total) * 100 : 0}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>Hata: {state.error}</div>
          )}

          {state.status === 'done' && state.results && (
            <div>
              {state.periodInfo && (
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 10 }}>
                  IS: {fmtDate(state.periodInfo.globalMin)} → {fmtDate(state.periodInfo.isEndTime)} · OOS: {fmtDate(state.periodInfo.oosStartTime)} → {fmtDate(state.periodInfo.globalMax)}
                </div>
              )}
              {state.results.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Yeterli trade sayısına ulaşan deneme bulunamadı — min. trade eşiğini düşürüp tekrar dene.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {state.results.map((r) => (
                    <div key={r.rank} style={{ border: '1px solid var(--bg-3)', borderRadius: 6, overflow: 'hidden' }}>
                      <div
                        onClick={() => setExpandedRank(expandedRank === r.rank ? null : r.rank)}
                        style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr', gap: 16, padding: '10px 12px', cursor: 'pointer', alignItems: 'center' }}>
                        <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>#{r.rank}</div>
                        <ScoreCell label="IS" m={r.isMetrics} score={r.isScore} />
                        <ScoreCell label="OOS" m={r.oosMetrics} score={r.oosScore} />
                      </div>
                      {(r.overfitWarning || r.insufficientOosData) && (
                        <div style={{ padding: '0 12px 8px', fontSize: 10, color: 'var(--red)' }}>
                          {r.insufficientOosData ? 'OOS\'ta yeterli trade yok -- bu setin OOS değerlendirmesi güvenilir değil.' : 'OOS skoru IS skorunun %30\'undan düşük -- olası aşırı uyum (overfitting).'}
                        </div>
                      )}
                      {expandedRank === r.rank && (
                        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <pre className="mono" style={{ fontSize: 10, color: 'var(--text-2)', background: 'var(--bg-3)', padding: 10, borderRadius: 4, overflowX: 'auto', margin: 0 }}>
                            {JSON.stringify(r.params, null, 2)}
                          </pre>
                          {onApplyParams && (
                            <button onClick={() => onApplyParams(r.params)}
                              style={{ alignSelf: 'flex-start', background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 4, padding: '5px 12px', fontSize: 10.5, cursor: 'pointer' }}>
                              Bu parametreleri panele uygula
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
