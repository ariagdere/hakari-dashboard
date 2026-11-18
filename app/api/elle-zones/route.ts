import { NextResponse } from 'next/server'
import { paralelDb } from '@/lib/paralelDb'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// /live grafigindeki elle zonlar: paralel sistemin elle_zones tablosunda su an gecerli olanlarin hepsi (Ari'nin cizdigi
// zonlar; SDL v3 elle zon stratejisi bunlarla islem yapiyor). id kalici numara (#1, #2 ...); yeni zon yeni numara alir,
// kapanan zonun ended_at'i dolar. PARALEL_DATABASE_URL yoksa configured: false.
export async function GET() {
  const db = paralelDb()
  if (!db) return NextResponse.json({ configured: false, zones: [] }, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const { rows } = await db.query<{ id: number; lo: number; hi: number; created_at: Date }>(
      `SELECT id, lo, hi, created_at FROM elle_zones
        WHERE created_at <= now() AND (ended_at IS NULL OR ended_at > now())
        ORDER BY lo DESC`,
    )
    return NextResponse.json(
      { configured: true, zones: rows.map((r) => ({ id: r.id, lo: Number(r.lo), hi: Number(r.hi), createdAt: r.created_at.getTime() })) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err: any) {
    console.error('elle-zones error:', err?.message ?? err)
    return NextResponse.json({ configured: true, zones: [], error: 'Paralel veritabanı okunamadı' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
