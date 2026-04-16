import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { buildInsightsWhere } from '@/lib/insightsFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { where, params } = buildInsightsWhere(req)
  const base = where ? `${where} AND` : 'WHERE'

  // Fetch MFE, MAE and risk for all completed trades
  // MFE = max favorable move in R units
  // MAE = max adverse move in R units (how close to SL it got)
  // A trade "wins" at target X if: MFE >= X AND MAE < 1.0 (SL not hit first)
  // If MAE >= 1.0 it means price hit SL before potentially reaching TP
  const { rows } = await pool.query(`
    SELECT
      sim_max_favorable_move  AS mfe,
      sim_max_adverse_move    AS mae,
      COALESCE(risk_usd, 10)  AS risk_usd,
      sim_r_multiple          AS actual_r,
      sim_result
    FROM btc_analysis
    ${base} sim_max_favorable_move IS NOT NULL
      AND sim_max_adverse_move IS NOT NULL
      AND risk_usd IS NOT NULL
      AND risk_usd > 0
      AND sim_result IN ('TP_HIT', 'SL_HIT')
  `, params)

  if (!rows.length) {
    return NextResponse.json({ sweep: [], optimal_r: null, current_avg_r: null, total_trades: 0 })
  }

  // Current average actual TP R
  const tpTrades = rows.filter((r: any) => r.sim_result === 'TP_HIT')
  const current_avg_r = tpTrades.length > 0
    ? tpTrades.reduce((sum: number, r: any) => sum + Number(r.actual_r), 0) / tpTrades.length
    : null

  // R sweep: 0.25 to 6.0 in 0.25 steps
  // For each R target, a trade wins if:
  //   MFE >= R (price reached the target)
  //   AND MAE < 1.0 (SL at 1R was not hit before TP)
  // A trade loses if MFE < R OR MAE >= 1.0
  const steps: number[] = []
  for (let r = 0.25; r <= 6.0; r = Math.round((r + 0.25) * 100) / 100) steps.push(r)

  const sweep = steps.map(r => {
    let pnl = 0
    let wins = 0
    let losses = 0

    for (const trade of rows) {
      const mfe  = Number(trade.mfe)
      const mae  = Number(trade.mae)
      const risk = Number(trade.risk_usd)

      // Win condition: MFE reached target AND stop (1R) not hit first
      if (mfe >= r && mae < 1.0) {
        pnl += r * risk
        wins++
      } else {
        pnl -= risk
        losses++
      }
    }

    const total = wins + losses
    const win_rate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
    return { r, pnl: Math.round(pnl * 100) / 100, wins, losses, win_rate }
  })

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
