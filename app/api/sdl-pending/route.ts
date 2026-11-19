import { NextResponse } from 'next/server'
import { getSdlPending } from '@/lib/sdlPending'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// /live: paralel SDL stratejisinde sirada bekleyen kurulumlar (lib/sdlPending.ts). PARALEL_DATABASE_URL yoksa
// { configured: false }; paralel DB okunamazsa 502.
export async function GET() {
  try {
    const r = await getSdlPending()
    if (!r) return NextResponse.json({ configured: false }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ configured: true, ...r }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    console.error('sdl-pending error:', err?.message ?? err)
    return NextResponse.json(
      { error: 'Bekleyen kurulumlar paralel veritabanından okunamadı', detail: String(err?.message ?? err) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
