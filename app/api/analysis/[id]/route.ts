import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const result = await pool.query(
    `SELECT * FROM btc_analysis WHERE id = $1`,
    [id]
  )
  if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  
  const row = result.rows[0]
  if (row.candles_json && typeof row.candles_json === 'string') {
    try {
      // Make başına [ sonuna ] koymadığı için biz ekliyoruz
      const fixed = '[' + row.candles_json + ']'
      row.candles_json = JSON.parse(fixed)
    } catch {
      row.candles_json = []
    }
  }
  return NextResponse.json(row)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await req.json()
  const { notes } = body
  await pool.query(
    `UPDATE btc_analysis SET notes = $1 WHERE id = $2`,
    [notes, id]
  )
  return NextResponse.json({ ok: true })
}
