import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const strategy = searchParams.get('strategy'); // null = tum stratejiler

    const params: any[] = [];
    let where = '';
    if (strategy && strategy !== 'ALL') {
      params.push(strategy);
      where = `WHERE o.strategy_label = $1`;
    }

    const { rows } = await pool.query(`
      SELECT
        o.status, o.exit_reason, o.is_manual, o.realized_pnl, o.volume,
        o.r_target, o.r_risk, o.closed_at
      FROM orders o
      ${where}
    `, params);

    let totalOrders = 0;
    let pending = 0;
    let open = 0;
    let expired = 0;
    let closed = 0;
    let tp = 0;
    let sl = 0;
    let totalPnl = 0;
    let totalR = 0;
    let winRSum = 0;
    let winCount = 0;
    const closedSeries: Array<{ t: number; r: number }> = [];

    for (const r of rows) {
      totalOrders++;

      if (r.status === 'PENDING') pending++;
      else if (r.status === 'OPEN') open++;
      else if (r.status === 'CANCELED') {
        if (r.exit_reason === 'EXPIRED') expired++;
      } else if (r.status === 'CLOSED') {
        closed++;
        if (r.exit_reason === 'TP') tp++;
        else if (r.exit_reason === 'SL') sl++;

        // Gercek realized PnL kullan
        const realPnl = r.realized_pnl != null ? Number(r.realized_pnl) : 0;
        totalPnl += realPnl;

        // R multiple: orders.r_target / r_risk (analysis'in orijinal risk mesafesine
        // gore hesaplanmis, sizing ile tutarli - normal ve inverse trade'lerde dogru calisir)
        const rTarget = r.r_target != null ? Number(r.r_target) : null;
        const rRisk = r.r_risk != null ? Number(r.r_risk) : 1;

        let rVal = 0;
        if (r.exit_reason === 'TP' && rTarget != null) {
          rVal = rTarget;
          totalR += rTarget;
          winRSum += rTarget;
          winCount++;
        } else if (r.exit_reason === 'SL') {
          rVal = -rRisk;
          totalR += -rRisk;
        }

        if (r.closed_at) {
          closedSeries.push({ t: new Date(r.closed_at).getTime(), r: rVal });
        }
      }
    }

    const decided = tp + sl;
    const winRate = decided > 0 ? (tp / decided) * 100 : 0;
    const avgWinR = winCount > 0 ? winRSum / winCount : null;

    // Max drawdown: kronolojik kumulatif R egrisinde tepe-dip farki
    const sortedSeries = closedSeries.slice().sort((a, b) => a.t - b.t);
    let cum = 0, peak = 0, maxDrawdown = 0;
    for (const s of sortedSeries) {
      cum += s.r;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Max consecutive wins: kronolojik siradaki en uzun TP serisi
    let maxConsWin = 0, streak = 0;
    for (const s of sortedSeries) {
      if (s.r > 0) {
        streak++;
        if (streak > maxConsWin) maxConsWin = streak;
      } else {
        streak = 0;
      }
    }

    return NextResponse.json({
      total_orders: totalOrders,
      pending,
      open,
      expired,
      closed,
      tp_count: tp,
      sl_count: sl,
      win_rate: Number(winRate.toFixed(1)),
      avg_win_r: avgWinR != null ? Number(avgWinR.toFixed(2)) : null,
      total_r: Number(totalR.toFixed(2)),
      total_pnl: Number(totalPnl.toFixed(2)),
      max_drawdown: Number(maxDrawdown.toFixed(2)),
      max_consecutive_wins: maxConsWin,
    });
  } catch (err) {
    console.error('orders-stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
