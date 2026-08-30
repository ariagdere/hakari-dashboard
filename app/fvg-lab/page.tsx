'use client'
import { useState, useMemo } from 'react'
import { DEFAULT_PARAMS, FvgParams, Candle, Fvg } from '@/lib/fvgEngine'
import { SimMetrics, SimTrade, EquityCurve, computeDayOfWeekBreakdown, computeHourOfDayBreakdown } from '@/lib/fvgBacktest'
import FvgLabChart from '@/components/FvgLabChart'
import FvgLabParamPanel from '@/components/FvgLabParamPanel'
import FvgLabTradeTable from '@/components/FvgLabTradeTable'
import FvgLabOpenList from '@/components/FvgLabOpenList'
import FvgLabEquityChart from '@/components/FvgLabEquityChart'
import FvgLabBreakdownTable from '@/components/FvgLabBreakdownTable'

interface SimulateResponse {
  candleCount: number
  dateRangeStart: string
  dateRangeEnd: string
  metrics: SimMetrics
  equityCurve: EquityCurve
  trades: SimTrade[]
  candles: Candle[]
  fvgs: Fvg[]
  params: FvgParams
}

function todayIso() { return new Date().toISOString().slice(0, 10) }
function daysAgoIso(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }

export default function FvgLabPage() {
  const [params, setParams] = useState<FvgParams>(DEFAULT_PARAMS)
  const [dateStart, setDateStart] = useState(daysAgoIso(14))
  const [dateEnd, setDateEnd] = useState(todayIso())
  const [result, setResult] = useState<SimulateResponse | null>(null)
  const [selectedFvgIdx, setSelectedFvgIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedRunId, setSavedRunId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runSimulation() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/fvg-lab/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, dateRangeStart: `${dateStart}T00:00:00Z`, dateRangeEnd: `${dateEnd}T23:59:59Z` }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Bilinmeyen hata'); setResult(null); return }
      setResult(data)
      setSelectedFvgIdx(null)
      setSaveStatus('idle')
      setSavedRunId(null)
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  async function saveRun() {
    if (!result) return
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/fvg-lab/save-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label || null,
          params,
          dateRangeStart: `${dateStart}T00:00:00Z`,
          dateRangeEnd: `${dateEnd}T23:59:59Z`,
          metrics: result.metrics,
          equityCurve: result.equityCurve,
          trades: result.trades,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveStatus('error'); return }
      setSaveStatus('saved')
      setSavedRunId(data.runId)
    } catch {
      setSaveStatus('error')
    }
  }

  const selectedFvg = result && selectedFvgIdx != null ? result.fvgs[selectedFvgIdx] : null

  const dayBreakdown = useMemo(() => result ? computeDayOfWeekBreakdown(result.trades) : [], [result])
  const hourBreakdown = useMemo(() => result ? computeHourOfDayBreakdown(result.trades) : [], [result])

  return (
    <div className="container" style={{ padding: '24px 24px 60px' }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>FVG / IFVG Simülasyon Laboratuvarı</h1>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
        Parametreleri ayarla, tarih aralığı seç, çalıştır. Hiçbir şey kaydedilmez — istersen ayrıca kaydedersin.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <label style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Başlangıç
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            style={{ marginLeft: 8, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Bitiş
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
            style={{ marginLeft: 8, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
        </label>
        <button onClick={runSimulation} disabled={loading} className="filter-btn active" style={{ fontSize: 12, padding: '7px 16px' }}>
          {loading ? 'Çalışıyor...' : 'Çalıştır'}
        </button>
        {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
        {result && (
          <>
            <input type="text" placeholder="İsim (opsiyonel)" value={label} onChange={e => setLabel(e.target.value)}
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 4, fontSize: 12, width: 160 }} />
            <button onClick={saveRun} disabled={saveStatus === 'saving'} className="filter-btn" style={{ fontSize: 12, padding: '7px 16px' }}>
              {saveStatus === 'saving' ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            {saveStatus === 'saved' && <span style={{ fontSize: 12, color: 'var(--green)' }}>Kaydedildi (run #{savedRunId})</span>}
            {saveStatus === 'error' && <span style={{ fontSize: 12, color: 'var(--red)' }}>Kaydetme başarısız</span>}
          </>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <FvgLabParamPanel params={params} onChange={setParams} onReset={() => setParams(DEFAULT_PARAMS)} />
      </div>

      {result && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <MetricCard label="Toplam İşlem" value={String(result.metrics.totalTrades)} />
            <MetricCard label="Win Rate" value={`%${result.metrics.winRate}`} />
            <MetricCard label="Toplam R" value={`${result.metrics.totalR >= 0 ? '+' : ''}${result.metrics.totalR}`}
              color={result.metrics.totalR >= 0 ? 'var(--green)' : 'var(--red)'} />
            <MetricCard label="Max DD" value={`-${result.metrics.maxDD}R`} color="var(--red)" />
            <MetricCard label="Consecutive Win" value={String(result.metrics.maxConsecutiveWins)} color="var(--green)" />
            <MetricCard label="Aynı Anda Aktif Max Trade" value={String(result.metrics.maxConcurrentTrades)} />
          </div>

          <FvgLabChart
            candles={result.candles}
            fvgs={result.fvgs}
            selectedIdx={selectedFvgIdx}
            onSelectFvg={setSelectedFvgIdx}
            params={result.params}
          />

          {selectedFvg && (
            <div style={{ marginTop: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontSize: 12 }}>
              <div style={{ color: 'var(--amber)', marginBottom: 8 }}>
                {selectedFvg.type === 'bullish' ? 'Bullish' : 'Bearish'} FVG — durum: {selectedFvg.status}
              </div>
              {selectedFvg.ifvgScore && (
                <div style={{ display: 'flex', gap: 16, color: 'var(--text-3)', marginBottom: 8 }}>
                  <span>Likidite: {selectedFvg.ifvgScore.sweep ? '✓' : '✗'}</span>
                  <span>BOS: {selectedFvg.ifvgScore.bosApplicable ? (selectedFvg.ifvgScore.bos ? '✓' : '✗') : 'N/A'}</span>
                  <span>Displacement: {selectedFvg.ifvgScore.displacementApplicable ? (selectedFvg.ifvgScore.displacement ? '✓' : '✗') : 'N/A'}</span>
                  <span>ZLEMA: {selectedFvg.ifvgScore.zlemaApplicable ? (selectedFvg.ifvgScore.zlemaAligned ? '✓' : '✗') : 'N/A'}
                    {selectedFvg.ifvgScore.zlemaApplicable && ` (1H:${selectedFvg.ifvgScore.zlema1h ?? '—'} 4H:${selectedFvg.ifvgScore.zlema4h ?? '—'})`}
                  </span>
                  <span>Skor: {selectedFvg.ifvgScore.total}/{selectedFvg.ifvgScore.maxScore}</span>
                </div>
              )}
              {selectedFvg.tradeSetup && (
                selectedFvg.tradeSetup.valid ? (
                  <div style={{ color: 'var(--text-2)' }}>
                    {selectedFvg.tradeSetup.direction} · Entry {selectedFvg.tradeSetup.entry?.toFixed(1)} · SL {selectedFvg.tradeSetup.sl?.toFixed(1)} · TP {selectedFvg.tradeSetup.tp?.toFixed(1)} · RR 1:{selectedFvg.tradeSetup.rr}
                    {selectedFvg.outcome && (
                      <span style={{ marginLeft: 12, color: selectedFvg.outcome.result === 'TP_HIT' ? 'var(--green)' : selectedFvg.outcome.result === 'SL_HIT' ? 'var(--red)' : 'var(--amber)' }}>
                        → {selectedFvg.outcome.result} ({selectedFvg.outcome.rMultiple >= 0 ? '+' : ''}{selectedFvg.outcome.rMultiple}R)
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-3)' }}>Geçersiz setup: {selectedFvg.tradeSetup.reason}</div>
                )
              )}
            </div>
          )}

          <div style={{ marginTop: 24, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <FvgLabEquityChart equityCurve={result.equityCurve} />
          </div>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <FvgLabBreakdownTable title="Haftanın Günü" buckets={dayBreakdown} />
            <FvgLabBreakdownTable title="Günün Saati (UTC+3)" buckets={hourBreakdown} />
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>İşlemler ({result.trades.length})</div>
            <FvgLabTradeTable trades={result.trades} selectedIdx={selectedFvgIdx} onSelect={setSelectedFvgIdx} />
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
              Açık FVG'ler ({result.fvgs.filter(f => f.status === 'open').length})
            </div>
            <FvgLabOpenList fvgs={result.fvgs} candles={result.candles} selectedIdx={selectedFvgIdx} onSelect={setSelectedFvgIdx} />
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 110 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 500, color: color || 'var(--text)' }} className="mono">{value}</div>
    </div>
  )
}
