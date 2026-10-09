'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const NAV_ITEMS = [
  { label: 'ANALYSIS', href: '/analysis' },
  { label: 'LIST', href: '/list' },
  { label: 'LIVE',      href: '/live' },
  { label: 'MKT',      href: '/mkt' },
  { label: 'FVG-Lab',      href: '/fvg-lab' },
]
// authEnabled: giris yapilandirilmissa (DASHBOARD_BASIC_AUTH_*) sagda "CIKIS" gosterilir.
export default function Navbar({ authEnabled = false }: { authEnabled?: boolean }) {
  const pathname = usePathname()
  if (pathname === '/login') return null // giris sayfasinda menu yok
  const isActive = (href: string) => {
    if (href === '/analysis') return pathname === '/analysis' || pathname.startsWith('/analysis/')
    return pathname === href
  }
  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', position: 'sticky', top: 0, zIndex: 20 }}>
      <div className="container" style={{ height: 48, display: 'flex', alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <Link href="/analysis" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', marginRight: 14, textDecoration: 'none' }}>
          HAKARI
        </Link>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="mono nav-link"
            style={{
              fontSize: 11,
              padding: '4px 12px',
              whiteSpace: 'nowrap',
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
        {authEnabled && (
          <form method="post" action="/api/auth/logout" style={{ marginLeft: 'auto', paddingLeft: 12, flexShrink: 0 }}>
            <button
              type="submit" className="mono nav-link" data-testid="logout"
              style={{
                fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap', letterSpacing: '0.06em', cursor: 'pointer',
                background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)',
              }}
            >
              ÇIKIŞ
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
