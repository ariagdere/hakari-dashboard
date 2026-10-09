import { NextRequest, NextResponse } from 'next/server'
import { isSameOrigin } from '@/lib/requestGuards'
import {
  LOGIN_FAIL_DELAY_MS, SESSION_COOKIE, authCredentials, clientIp, createFailureLimiter, createSessionToken, isHttpsRequest,
  needsRefresh, publicUrl, safeEqual, safeNextPath, sessionCookieOptions, verifySessionToken,
} from '@/lib/session'

// Tum dashboard (sayfalar + API) icin erisim kontrolu.
//
// - Sayfalar: oturum cerezi gerekir (lib/session.ts); yoksa /login'e yonlendirilir. Giris kendi
//   formumuzla yapilir -- tarayicinin Basic Auth kutusu artik hic acilmaz, Chrome sifre yoneticisi
//   formu kaydedip doldurabilir.
// - API (/api/*): oturum cerezi YA DA Basic Auth basligi (script / test). Ikisi de yoksa 401 JSON;
//   WWW-Authenticate gonderilmez, tarayici kutusu acilmaz. Hatali Basic denemeleri formla ayni
//   kuralla sinirli (IP basina 15 dakikada 10 hata -> 15 dakika 429).
// - Yazan API istekleri (GET/HEAD/OPTIONS disi) baska bir siteden geliyorsa 403 (CSRF): tarayici bu
//   isteklerde Origin / Sec-Fetch-Site gonderir; bunlari gondermeyen script'ler etkilenmez.
// - Kimlik bilgileri Railway degiskenlerinden: DASHBOARD_BASIC_AUTH_USER, DASHBOARD_BASIC_AUTH_PASSWORD
//   (calisirken okunur; Railway degisken degisikliginde zaten yeniden deploy eder).
// - Degiskenler tanimli degilse istekler GECER (deploy sonrasi kilitlenme olmasin). Hassas route'lar
//   (canli fiyat akisi, tanilama, emir) bu durumda kendileri 503 doner -- bkz. lib/authConfig.ts.
// - Auth disinda: /api/health (Railway healthcheck, railway.toml), giris / cikis yolu (/login,
//   /api/auth/login, /api/auth/logout -- bunlar kaynak kontrolunu kendileri yapar; cikis yalnizca
//   cerezi siler).

const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/logout'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const basicLimiter = createFailureLimiter()

function basicAuthOk(req: NextRequest, creds: { user: string; pass: string }): boolean {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Basic ')) return false
  try {
    const decoded = atob(header.slice(6))
    const sep = decoded.indexOf(':')
    return sep >= 0 && safeEqual(decoded.slice(0, sep), creds.user) && safeEqual(decoded.slice(sep + 1), creds.pass)
  } catch {
    return false // bozuk base64
  }
}

// API reddi. notSent: middleware'in reddettigi istek hicbir route koduna ulasmaz -- emir paneli (OrderPanel)
// notSent tasimayan cevabi "emir gitmis olabilir" sayar; oturumu dusmus panelden gelen emir istegi de
// boylece net "gonderilmedi" olarak gorunur.
function reject(status: number, error: string) {
  return NextResponse.json({ error, notSent: true }, { status })
}

function crossSiteWrite(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false
  const origin = isSameOrigin(req)
  if (origin.origin) return !origin.ok
  const site = req.headers.get('sec-fetch-site')
  return site === 'cross-site' || site === 'same-site'
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  if (pathname.startsWith('/api/') && crossSiteWrite(req)) {
    return reject(403, 'Geçersiz istek kaynağı')
  }

  const creds = authCredentials()
  if (!creds) return NextResponse.next()

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    // Zaten giris yapilmissa formu gosterme, gidilmek istenen sayfaya gec
    if (session) return NextResponse.redirect(publicUrl(req, safeNextPath(req.nextUrl.searchParams.get('next'))))
    return NextResponse.next()
  }

  if (session) {
    const res = NextResponse.next()
    if (needsRefresh(session)) {
      // Kayan sure: cerez yenilenir, giris ani (90 gunluk ust sinir) korunur
      const token = await createSessionToken(undefined, session.lt)
      if (token) res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isHttpsRequest(req)))
    }
    return res
  }

  if (pathname.startsWith('/api/')) {
    if ((req.headers.get('authorization') ?? '').startsWith('Basic ')) {
      const ip = clientIp(req)
      if (basicLimiter.isLocked(ip)) {
        return reject(429, 'Çok fazla hatalı deneme, 15 dakika sonra tekrar dene')
      }
      if (basicAuthOk(req, creds)) {
        basicLimiter.reset(ip)
        return NextResponse.next()
      }
      const locked = basicLimiter.fail(ip)
      console.warn(`api: hatali Basic Auth (${ip})`)
      await new Promise((r) => setTimeout(r, LOGIN_FAIL_DELAY_MS))
      if (locked) return reject(429, 'Çok fazla hatalı deneme, 15 dakika sonra tekrar dene')
    }
    return reject(401, 'Oturum açılmamış ya da süresi dolmuş — sayfayı yenileyip giriş yap')
  }

  // Girdikten sonra donulecek sayfa (istemci gezintisinin _rsc onbellek parametresi atilir)
  const params = new URLSearchParams(search)
  params.delete('_rsc')
  const back = pathname + (params.toString() ? `?${params.toString()}` : '')
  return NextResponse.redirect(publicUrl(req, `/login?next=${encodeURIComponent(back)}`))
}

export const config = {
  // Next'in statik dosyalari ve favicon haric her sey.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
