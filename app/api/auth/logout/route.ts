import { NextRequest, NextResponse } from 'next/server'
import { isSameOrigin } from '@/lib/requestGuards'
import { SESSION_COOKIE, isHttpsRequest, sessionCookieOptions } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Navbar'daki "Cikis": oturum cerezini siler, giris sayfasina doner (goreli yonlendirme -- bkz. login).
export async function POST(req: NextRequest) {
  const origin = isSameOrigin(req)
  if (origin.origin && !origin.ok) return NextResponse.json({ error: 'Geçersiz istek kaynağı' }, { status: 403 })
  const res = new NextResponse(null, { status: 303, headers: { Location: '/login?out=1', 'Cache-Control': 'no-store' } })
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(isHttpsRequest(req), 0))
  return res
}
