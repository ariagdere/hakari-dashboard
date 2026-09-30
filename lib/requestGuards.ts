import { NextRequest } from 'next/server'

// Yazan istekler icin ayni-koken kontrolu. Tarayici Basic Auth bilgisini baska sitelerden
// gelen isteklere de otomatik ekledigi icin, emir gibi yan etkili POST'lar sadece dashboard'un
// kendi sayfasindan gelmeli (CSRF). Tarayicilar POST fetch'lerinde Origin'i her zaman gonderir.
export function isSameOrigin(req: NextRequest): { ok: boolean; origin: string | null; host: string | null } {
  const origin = req.headers.get('origin')
  const hosts = [req.headers.get('x-forwarded-host'), req.headers.get('host')].filter((h): h is string => !!h)
  if (!origin) return { ok: false, origin: null, host: hosts[0] ?? null }
  let originHost: string | null = null
  try {
    originHost = new URL(origin).host
  } catch {
    return { ok: false, origin, host: hosts[0] ?? null }
  }
  return { ok: hosts.includes(originHost), origin, host: hosts[0] ?? null }
}

export function isJsonRequest(req: NextRequest): boolean {
  return (req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')
}
