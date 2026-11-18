import { NextResponse } from 'next/server'
import { paralelZoneFetch } from '@/lib/paralelZones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// /live'dan elle zonu pasife alma (yerine zon eklenmez): paralel web'e aktarilir (lib/paralelZones.ts).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: 'Zon numarası geçersiz' }, { status: 400 })
  const r = await paralelZoneFetch(`/api/piyasa/elle-zonlar/${n}/kapat`, { method: 'POST' })
  if (r.status === 200) console.log(`elle zon #${n} /live'dan pasife alındı`)
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}
