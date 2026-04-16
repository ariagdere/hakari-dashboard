import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  // Fetch all MFE and risk_usd values for eligible trades
  const { rows } = await pool.query(`
    SELECT
      sim_max_favorable_move AS mfe,
      COALESCE(risk_usd, 10) AS risk_usd,
      sim_r_multiple,
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

  // Current average TP R (actual results)
  const tpTrades = rows.filter(r => r.sim_result === 'TP_HIT')
  const current_avg_r = tpTrades.length > 0
    ? tpTrades.reduce((sum: number, r: any) => sum + Number(r.sim_r_multiple), 0) / tpTrades.length
    : null

  // R sweep: 0.25 to 6.0 in 0.25 steps
  const sweep: { r: number; pnl: number; wins: number; losses: number; win_rate: number }[] = []
  const steps = []
  for (let r = 0.25; r <= 6.0; r = Math.round((r + 0.25) * 100) / 100) steps.push(r)

  for (const r of steps) {
    let pnl = 0
    let wins = 0
    let losses = 0
    for (const trade of rows) {
      const mfe = Number(trade.mfe)
      const risk = Number(trade.risk_usd)
      if (mfe >= r) {
        pnl += r * risk
        wins++
      } else {
        pnl -= risk
        losses++
      }
    }
    const win_rate = rows.length > 0 ? Math.round((wins / rows.length) * 1000) / 10 : 0
    sweep.push({ r, pnl: Math.round(pnl * 100) / 100, wins, losses, win_rate })
  }

  // Find optimal R (max P/L)
  const optimal = sweep.reduce((best, cur) => cur.pnl > best.pnl ? cur : best, sweep[0])

  return NextResponse.json({
    sweep,
    optimal_r: optimal.r,
    optimal_pnl: optimal.pnl,
    optimal_wins: optimal.wins,
    optimal_losses: optimal.losses,
    optimal_win_rate: optimal.win_rate,
    current_avg_r: current_avg_r ? Math.round(current_avg_r * 100) / 100 : null,
    total_trades: rows.length,
  })
}
