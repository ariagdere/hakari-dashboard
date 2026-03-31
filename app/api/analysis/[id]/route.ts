import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const result = await pool.query(
    `SELECT * FROM btc_analysis WHERE id = $1`,
    [id]
  )
  if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}
