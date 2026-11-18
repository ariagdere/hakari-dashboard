// /live'dan elle zon ekleme, duzenleme ve pasife alma: paralel web'in API'si uzerinden, sunucudan sunucuya gizli
// anahtarla (paralel sistemin elle_zones tablosuna tek yazan paralel; kurallar ve cakisma denetimi orada).
// PARALEL_WEB_URL: paralel web servisinin adresi (orn. https://<servis>.up.railway.app).
// PARALEL_ZONE_TOKEN: paralel web'deki ZONE_API_TOKEN'in aynisi. Ikisi yoksa /live'da zon yalniz gorunur.
// Bu dosya yalniz sunucuda kullanilir (anahtar tarayiciya gitmez).

export function paralelZoneApi(): { base: string; token: string } | null {
  const base = process.env.PARALEL_WEB_URL?.trim().replace(/\/+$/, '')
  const token = process.env.PARALEL_ZONE_TOKEN?.trim()
  if (!base || !token) return null
  return { base, token }
}

const TIMEOUT_MS = 10_000

export async function paralelZoneFetch(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const api = paralelZoneApi()
  if (!api) return { status: 503, body: { error: "Zon yazmak için Railway'de PARALEL_WEB_URL ve PARALEL_ZONE_TOKEN tanımlı değil" } }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${api.base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${api.token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    if (res.status === 401) return { status: 502, body: { error: 'Paralel sistem anahtarı kabul etmedi (PARALEL_ZONE_TOKEN ile ZONE_API_TOKEN aynı mı?)' } }
    return { status: res.status, body: body ?? { error: `Paralel sistem yanıtı okunamadı (HTTP ${res.status})` } }
  } catch (err: any) {
    console.error(`paralel zon API ${path}:`, err?.message ?? err)
    return { status: 502, body: { error: ctrl.signal.aborted ? 'Paralel sistem yanıt vermedi (zaman aşımı)' : 'Paralel sisteme bağlanılamadı' } }
  } finally {
    clearTimeout(timer)
  }
}
