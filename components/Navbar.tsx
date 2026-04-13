'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { label: 'ANALİZ', href: '/dashboard' },
  { label: 'SEQ',    href: '/sequential' },
  { label: 'MKT',   href: '/mkt' },
  { label: 'OPS',   href: '/ops' },
  { label: 'INSIGHTS', href: '/insights' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }))
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [])

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
    return pathname === href
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', position: 'sticky', top: 0, zIndex: 20 }}>
      <div className="container" style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <Link href="/dashboard" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginRight: 14, textDecoration: 'none' }}>
            HAKARI
          </Link>
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="mono"
              style={{
                fontSize: 11,
                padding: '4px 12px',
                borderLeft: '1px solid var(--border)',
                textDecoration: 'none',
                letterSpacing: '0.06em',
                transition: 'color 0.1s',
                color: isActive(item.href) ? 'var(--text)' : 'var(--text-3)',
                borderBottom: isActive(item.href) ? '2px solid var(--text)' : '2px solid transparent',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{time}</span>
      </div>
    </div>
  )
}
