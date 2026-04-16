import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  // sim_max_favorable_move is already in USD (maxFavorable * positionSizeBtc)
  // mfe_r = mfe_usd / risk_usd  →  how many R units the price moved in favor
  const { rows } = await pool.query(`
    SELECT
      sim_max_favorable_move  AS mfe_usd,
      COALESCE(risk_usd, 20)  AS risk_usd,
      sim_r_multiple          AS actual_r,
      sim_result
    FROM btc_analysis
    ${base} sim_max_favorable_move IS NOT NULL
      AND risk_usd IS NOT NULL
      AND risk_usd > 0
      AND sim_result IN ('TP_HIT', 'SL_HIT')
  `, params)

  if (!rows.length) {
    return NextResponse.json({ sweep: [], optimal_r: null, current_avg_r: null, total_trades: 0 })
  }

  const trades = rows.map((r: any) => ({
    mfe_r:    Number(r.mfe_usd) / Number(r.risk_usd),
    risk_usd: Number(r.risk_usd),
    actual_r: Number(r.actual_r),
    result:   r.sim_result,
  }))

  const tpTrades = trades.filter((t: any) => t.result === 'TP_HIT')
  const current_avg_r = tpTrades.length > 0
    ? Math.round(tpTrades.reduce((s: number, t: any) => s + t.actual_r, 0) / tpTrades.length * 100) / 100
    : null

  const steps: number[] = []
  for (let r = 0.25; r <= 6.0; r = Math.round((r + 0.25) * 100) / 100) steps.push(r)

  const sweep = steps.map(r => {
    let pnl = 0; let wins = 0; let losses = 0
    for (const t of trades) {
      if (t.mfe_r >= r) { pnl += r * t.risk_usd; wins++ }
      else               { pnl -= t.risk_usd;     losses++ }
    }
    const win_rate = trades.length > 0 ? Math.round((wins / trades.length) * 1000) / 10 : 0
    return { r, pnl: Math.round(pnl * 100) / 100, wins, losses, win_rate }
  })

  const optimal = sweep.reduce((best, cur) => cur.pnl > best.pnl ? cur : best, sweep[0])

  return NextResponse.json({
    sweep,
    optimal_r:        optimal.r,
    optimal_pnl:      optimal.pnl,
    optimal_wins:     optimal.wins,
    optimal_losses:   optimal.losses,
    optimal_win_rate: optimal.win_rate,
    current_avg_r,
    total_trades:     trades.length,
  })
}
