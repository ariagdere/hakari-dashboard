import { NextRequest, NextResponse } from 'next/server'
import { paralelDb } from '@/lib/paralelDb'
import { paralelZoneApi, paralelZoneFetch } from '@/lib/paralelZones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// /live grafigindeki elle zonlar: paralel sistemin elle_zones tablosunda su an gecerli olanlarin hepsi (Ari'nin cizdigi
// zonlar; SDL v3 elle zon stratejisi bunlarla islem yapiyor). id kalici numara (#1, #2 ...); yeni zon yeni numara alir,
// kapanan zonun ended_at'i dolar. PARALEL_DATABASE_URL yoksa configured: false. editable: /live'dan zon yazilabilir mi
// (PARALEL_WEB_URL ve PARALEL_ZONE_TOKEN, lib/paralelZones.ts).
// ?kural=1: zon eklerken / duzenlerken paralel web'in API'sinden zonlar ve ekleme kurallari (cakisma esigi, uyari
// sinirlari); kaydi da o denetledigi icin cizerken ayni listeyle karsilastirilir.
// POST: zon ekleme ya da duzenleme, paralel web'e aktarilir (govde ve yanit ayni).
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('kural') === '1') {
    const r = await paralelZoneFetch('/api/piyasa/elle-zonlar')
    return NextResponse.json(r.body, { status: r.status, headers: NO_STORE })
  }
  const editable = !!paralelZoneApi()
  const db = paralelDb()
  if (!db) return NextResponse.json({ configured: false, editable, zones: [] }, { headers: NO_STORE })
  try {
    const { rows } = await db.query<{ id: number; lo: number; hi: number; created_at: Date }>(
      `SELECT id, lo, hi, created_at FROM elle_zones
        WHERE created_at <= now() AND (ended_at IS NULL OR ended_at > now())
        ORDER BY lo DESC`,
    )
    return NextResponse.json(
      { configured: true, editable, zones: rows.map((r) => ({ id: r.id, lo: Number(r.lo), hi: Number(r.hi), createdAt: r.created_at.getTime() })) },
      { headers: NO_STORE },
    )
  } catch (err: any) {
    console.error('elle-zones error:', err?.message ?? err)
    return NextResponse.json({ configured: true, editable, zones: [], error: 'Paralel veritabanı okunamadı' }, { status: 502, headers: NO_STORE })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400, headers: NO_STORE })
  const r = await paralelZoneFetch('/api/piyasa/elle-zonlar', { method: 'POST', body })
  if (r.status === 200) console.log(`elle zon /live'dan kaydedildi: #${r.body?.zone?.id} (pasif: ${(r.body?.ended ?? []).join(', ') || '-'})`)
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE })
}
