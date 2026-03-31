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
      row.candles_json = JSON.parse(row.candles_json)
    } catch {
      row.candles_json = []
    }
  }
  return NextResponse.json(row)
}
