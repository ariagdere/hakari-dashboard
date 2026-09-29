import pool from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// analyses-export/route.ts ile aynı desende -- orders tablosunun tamamını CSV olarak verir.
export async function GET() {
  const { rows } = await pool.query(`
    SELECT
      o.id, o.strategy_label, o.symbol, o.direction, o.status,
      o.created_at, o.opened_at, o.closed_at,
      o.volume, o.entry_price, o.fill_price, o.close_price, o.sl, o.tp, o.rr,
      o.r_target, o.r_risk, o.realized_pnl, o.exit_reason, o.is_manual,
      o.h1_ls_angle, o.m5_ls_angle, o.h1_tt_pos_angle, o.m5_tt_pos_angle
    FROM orders o
    ORDER BY o.created_at DESC
  `)
  if (rows.length === 0) {
    return new NextResponse('No data', { status: 204 })
  }

  const headers = [
    'id', 'strategy_label', 'symbol', 'direction', 'status',
    'created_at', 'opened_at', 'closed_at',
    'volume', 'entry_price', 'fill_price', 'close_price', 'sl', 'tp', 'rr',
    'r_target', 'r_risk', 'realized_pnl', 'exit_reason', 'is_manual',
    'h1_ls_angle', 'm5_ls_angle', 'h1_tt_pos_angle', 'm5_tt_pos_angle',
  ]

  const toTR = (v: any) => {
    if (!v) return ''
    const d = new Date(v)
    d.setHours(d.getHours() + 3)
    return d.toISOString().replace('T', ' ').slice(0, 19)
  }

  const escape = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id, r.strategy_label, r.symbol, r.direction, r.status,
        toTR(r.created_at), toTR(r.opened_at), toTR(r.closed_at),
        r.volume, r.entry_price, r.fill_price, r.close_price, r.sl, r.tp, r.rr,
        r.r_target, r.r_risk, r.realized_pnl, r.exit_reason, r.is_manual,
        r.h1_ls_angle, r.m5_ls_angle, r.h1_tt_pos_angle, r.m5_tt_pos_angle,
      ]
        .map(escape)
        .join(',')
    ),
  ]

  const filename = `orders_${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
