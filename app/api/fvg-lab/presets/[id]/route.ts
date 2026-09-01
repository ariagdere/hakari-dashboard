import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })
    }
    await pool.query(`DELETE FROM fvg_param_presets WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('presets DELETE error:', err?.message || err)
    return NextResponse.json({ error: 'Preset silinemedi' }, { status: 500 })
  }
}
