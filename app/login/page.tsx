import type { Metadata } from 'next'
import { isBasicAuthConfigured } from '@/lib/authConfig'
import { safeNextPath } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Giriş — Hakari',
  robots: { index: false, follow: false },
}

const ERRORS: Record<string, string> = {
  '1': 'Kullanıcı adı ya da şifre yanlış.',
  locked: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.',
  origin: 'Güvenlik kontrolü geçmedi. Sayfayı yenileyip tekrar dene.',
  config: 'Giriş yapılandırılmamış: Railway\'de DASHBOARD_BASIC_AUTH_USER ve DASHBOARD_BASIC_AUTH_PASSWORD tanımlı değil.',
}

// Kendi giris formumuz (tarayicinin Basic Auth kutusu yerine). Duz HTML form POST'u + autocomplete
// alanlari: Chrome / Safari sifre yoneticileri formu tanir, kaydeder ve doldurur. JS gerektirmez.
// Gonderim /api/auth/login'e gider; basarida istenen sayfaya, hatada buraya ?error= ile doner.
export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string; out?: string } }) {
  const next = safeNextPath(searchParams.next)
  const configured = isBasicAuthConfigured()
  const errorKey = !configured ? 'config' : searchParams.error
  // hasOwnProperty: ?error=constructor gibi degerler nesnenin prototipine dusmesin
  const error = errorKey ? (Object.prototype.hasOwnProperty.call(ERRORS, errorKey) ? ERRORS[errorKey] : ERRORS['1']) : null

  return (
    <main className="login-wrap">
      <form method="post" action="/api/auth/login" className="login-card" data-testid="login-form">
        <div className="login-brand">HAKARI</div>
        <div className="mono login-sub">Devam etmek için giriş yap</div>
        {error && <div className="login-msg err" role="alert" data-testid="login-error">{error}</div>}
        {!error && searchParams.out && <div className="login-msg info" role="status" data-testid="login-info">Çıkış yapıldı.</div>}
        <input type="hidden" name="next" value={next} />
        <label className="login-label" htmlFor="username">KULLANICI ADI</label>
        <input
          className="login-input" id="username" name="username" type="text" autoComplete="username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus
        />
        <label className="login-label" htmlFor="password">ŞİFRE</label>
        <input className="login-input" id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="login-btn" type="submit">Giriş yap</button>
      </form>
    </main>
  )
}
