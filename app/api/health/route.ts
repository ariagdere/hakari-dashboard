import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Railway healthcheck -- Basic Auth disinda (middleware.ts PUBLIC_PATHS). Hicbir veri dondurmez.
export function GET() {
  return NextResponse.json({ ok: true })
}
