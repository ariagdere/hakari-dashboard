import { NextRequest, NextResponse } from 'next/server'

// Tum dashboard (sayfalar + API) icin HTTP Basic Auth.
//
// - Kimlik bilgileri Railway degiskenlerinden gelir: DASHBOARD_BASIC_AUTH_USER,
//   DASHBOARD_BASIC_AUTH_PASSWORD. Middleware Edge runtime'da calistigi icin bu
//   degerler build sirasinda okunur -- degistirince yeniden deploy gerekir
//   (Railway degisken degisikliginde zaten yeniden deploy eder).
// - Degiskenler tanimli degilse istekler GECER (deploy sonrasi kilitlenme olmasin).
//   Hassas yeni route'lar (canli fiyat akisi, tanilama, ileride emir) bu durumda
//   kendileri 503 doner -- bkz. lib/authConfig.ts.
// - /api/health auth disinda: Railway healthcheck'i buraya bakar (railway.toml).

const PUBLIC_PATHS = new Set(['/api/health'])

// Sabit zamanli karsilastirma -- Edge runtime'da crypto.timingSafeEqual yok.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function middleware(req: NextRequest) {
  if (PUBLIC_PATHS.has(req.nextUrl.pathname)) return NextResponse.next()

  const user = process.env.DASHBOARD_BASIC_AUTH_USER
  const pass = process.env.DASHBOARD_BASIC_AUTH_PASSWORD
  if (!user || !pass) return NextResponse.next()

  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6))
      const sep = decoded.indexOf(':')
      if (sep >= 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), pass)) {
        return NextResponse.next()
      }
    } catch {
      // bozuk base64 -> 401'e dus
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Hakari", charset="UTF-8"' },
  })
}

export const config = {
  // Next'in statik dosyalari ve favicon haric her sey.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
