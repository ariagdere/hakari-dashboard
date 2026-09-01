import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

// Tum presetleri (id, isim, parametreler, tarihler) doner -- trade/sonuc
// verisi tasimaz, sadece adlandirilmis FvgParams anlik goruntuleri.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, params, created_at, updated_at FROM fvg_param_presets ORDER BY name ASC`
    )
    return NextResponse.json({ presets: rows })
  } catch (err: any) {
    console.error('presets GET error:', err?.message || err)
    return NextResponse.json({ error: 'Presetler alınamadı' }, { status: 500 })
  }
}

// Yeni preset kaydeder -- AYNI isim zaten varsa UZERINE YAZAR (upsert),
// kullanicinin "guncelle" beklentisiyle tutarli.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, params } = body as { name: string; params: unknown }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'İsim zorunlu' }, { status: 400 })
    }
    if (!params || typeof params !== 'object') {
      return NextResponse.json({ error: 'params zorunlu' }, { status: 400 })
    }
    const { rows } = await pool.query(
      `INSERT INTO fvg_param_presets (name, params, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET params = EXCLUDED.params, updated_at = NOW()
       RETURNING id, name, params, created_at, updated_at`,
      [name.trim(), JSON.stringify(params)]
    )
    return NextResponse.json({ preset: rows[0] })
  } catch (err: any) {
    console.error('presets POST error:', err?.message || err)
    return NextResponse.json({ error: 'Preset kaydedilemedi' }, { status: 500 })
  }
}
