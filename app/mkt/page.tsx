'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ASSETS = [
  { symbol: 'DXY',    name: 'US Dollar Index',  tv: 'CAPITALCOM:DXY'  },
  { symbol: 'US500',  name: 'S&P 500 CFD',      tv: 'OANDA:SPX500USD' },
  { symbol: 'US100',  name: 'Nasdaq 100 CFD',   tv: 'OANDA:NAS100USD' },
  { symbol: 'VIXY',   name: 'VIX Short-Term',   tv: 'AMEX:VIXY'       },
  { symbol: 'BTC',    name: 'Bitcoin / USD',    tv: 'BINANCE:BTCUSDT' },
  { symbol: 'XAUUSD', name: 'Gold / USD',       tv: 'OANDA:XAUUSD'    },
  { symbol: 'US02Y',  name: '2Y Treasury ETF',  tv: 'NASDAQ:SHY'      },
  { symbol: 'UKOIL',  name: 'Brent Crude Oil',  tv: 'OANDA:BCOUSD'   },
]

const TF_OPTIONS = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1s', value: '60' },
  { label: '1g', value: 'D' },
]

function useNYSEStatus() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = () => {
      const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const d = ny.getDay(), h = ny.getHours(), m = ny.getMinutes()
      const mins = h * 60 + m
      setOpen(d >= 1 && d <= 5 && mins >= 570 && mins < 960)
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [])
  return open
}

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('tr-TR', { hour12: false }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  return time
}

export default function MktPage() {
  const [tf, setTf] = useState('5')
  const [toolbar, setToolbar] = useState(false)
  const nyseOpen = useNYSEStatus()
  const clock = useClock()
  const renderKey = `${tf}-${toolbar}`

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }} className="mkt-root">

      {/* Header — Hakari stilinde */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', flexShrink: 0 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', overflow: 'hidden' }}>

          {/* Sol: Logo + Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginRight: 14 }}>HAKARI</span>
            <Link
              href="/dashboard"
              style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', textDecoration: 'none', letterSpacing: '0.06em', transition: 'color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              ANALİZ
            </Link>
            <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', letterSpacing: '0.06em', borderBottom: '2px solid var(--text)' }}>
              MKT
            </span>
            <Link
              href="/ops"
              style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', padding: '4px 12px', borderLeft: '1px solid var(--border)', textDecoration: 'none', letterSpacing: '0.06em', transition: 'color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              OPS
            </Link>
          </div>

          {/* Sağ: kontroller */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', minWidth: 0 }}>
            {/* NYSE status — mobilde gizli */}
            <div className="mkt-nyse" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: nyseOpen ? 'var(--green)' : 'var(--text-3)', display: 'inline-block', flexShrink: 0, animation: nyseOpen ? 'pulse-dot 2s ease-in-out infinite' : 'none' }} />
              <span className="mono" style={{ fontSize: 10, color: nyseOpen ? 'var(--green)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                NYSE {nyseOpen ? 'AÇIK' : 'KAPALI'}
              </span>
            </div>

            <div className="mkt-nyse" style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

            {/* TF butonları */}
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {TF_OPTIONS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTf(t.value)}
                  className={`filter-btn${tf === t.value ? ' active' : ''}`}
                  style={{ padding: '3px 8px', fontSize: 10 }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Toolbar toggle — mobilde gizli */}
            <div className="mkt-nyse" style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
            <button
              className={`filter-btn mkt-nyse${toolbar ? ' active' : ''}`}
              onClick={() => setToolbar(t => !t)}
              style={{ padding: '3px 8px', fontSize: 10, flexShrink: 0 }}
            >
              TOOLBAR
            </button>

            {/* Saat — mobilde gizli */}
            <div className="mkt-nyse" style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
            <span className="mono mkt-nyse" style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{clock}</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: 1,
        background: 'var(--border)',
        overflow: 'hidden',
      }} className="mkt-grid">
        {ASSETS.map(asset => {
          const src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_${asset.symbol}&symbol=${encodeURIComponent(asset.tv)}&interval=${tf}&hidesidetoolbar=1&hidetoptoolbar=${toolbar ? 0 : 1}&symboledit=0&saveimage=0&toolbarbg=0a0a0b&studies=[]&theme=dark&style=1&timezone=Europe%2FIstanbul&withdateranges=0&showpopupbutton=0&hide_legend=1&hide_volume=1&locale=tr`
          return (
            <div key={`${asset.symbol}-${renderKey}`} style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
              {/* Cell header */}
              <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text)' }}>{asset.symbol}</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{asset.name}</span>
              </div>
              {/* Chart */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <iframe
                  src={src}
                  style={{
                    width: '100%',
                    height: toolbar ? '100%' : 'calc(100% + 38px)',
                    marginTop: toolbar ? 0 : -38,
                    border: 'none',
                    display: 'block',
                  }}
                  allowFullScreen
                />
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @media (max-width: 768px) {
          .mkt-nyse { display: none !important; }
          .mkt-root {
            height: auto !important;
            overflow: visible !important;
          }
          .mkt-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: none !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          .mkt-grid > div {
            height: 280px;
            min-height: 280px;
          }
        }
      `}</style>
    </div>
  )
}
