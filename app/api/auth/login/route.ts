import { NextRequest, NextResponse } from 'next/server'
import { isSameOrigin } from '@/lib/requestGuards'
import {
  LOGIN_FAIL_DELAY_MS, MAX_LOGIN_FAILURES, SESSION_COOKIE, authCredentials, clientIp, createFailureLimiter, createSessionToken,
  isHttpsRequest, safeEqual, safeNextPath, sessionCookieOptions,
} from '@/lib/session'

export const dynamic = 'force-dynamic'

// /login formunun gonderildigi yer (duz HTML form POST'u -- sifre yoneticileri en iyi bunu tanir).
// Basarili giriste oturum cerezi yazilip istenen sayfaya, hatada /login'e geri yonlendirilir (303).
// Yonlendirmeler goreli: Next sunucu tarafinda istek adresini localhost:PORT olarak gorur.
//
// Kaba kuvvete karsi: ayni IP'den 15 dakikada 10 hatali denemede o IP 15 dakika kilitlenir (dogru
// sifre de kabul edilmez); her hatali denemede kisa bir bekleme de var.

const limiter = createFailureLimiter()

function redirect(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })
}

function backToLogin(error: string, next: string) {
  const q = new URLSearchParams({ error })
  if (next !== '/') q.set('next', next)
  return redirect(`/login?${q.toString()}`)
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return backToLogin('1', '/')
  }
  const username = String(form.get('username') ?? '')
  const password = String(form.get('password') ?? '')
  const next = safeNextPath(String(form.get('next') ?? '/'))

  // Baska bir siteden gonderilen form (login CSRF). Origin'i hic gondermeyen istemciye izin verilir.
  const origin = isSameOrigin(req)
  if (origin.origin && !origin.ok) return backToLogin('origin', next)

  const creds = authCredentials()
  if (!creds) return backToLogin('config', next)

  const ip = clientIp(req)
  if (limiter.isLocked(ip)) {
    console.warn(`login: kilitli IP'den deneme (${ip})`)
    return backToLogin('locked', next)
  }

  if (!(safeEqual(username, creds.user) && safeEqual(password, creds.pass))) {
    const locked = limiter.fail(ip)
    console.warn(`login: hatali giris (${ip}, ${limiter.count(ip)}/${MAX_LOGIN_FAILURES})`)
    await new Promise((r) => setTimeout(r, LOGIN_FAIL_DELAY_MS))
    return backToLogin(locked ? 'locked' : '1', next)
  }

  limiter.reset(ip)
  const token = await createSessionToken()
  if (!token) return backToLogin('config', next)
  console.log(`login: giris yapildi (${ip})`)
  const res = redirect(next)
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isHttpsRequest(req)))
  return res
}
