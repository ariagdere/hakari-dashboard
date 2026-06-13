import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// PnL normalize: gerçek MT5 volume sabit 0.1 ama arayüzde 50$ risk hedefine
// göre normalize ediyoruz. position_size_btc * 2.5 = ideal volume.
// realized_pnl gerçek volume (0.1) ile geldiği için, ideal/gerçek oranıyla ölçekliyoruz.
const SIZE_MULTIPLIER = 2.5;

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.status, o.exit_reason, o.is_manual, o.realized_pnl, o.volume,
        a.position_size_btc, a.rr AS analysis_rr
      FROM orders o
      LEFT JOIN btc_analysis a ON a.id = o.analysis_id
    `);

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

        // Normalize PnL to 50$ basis
        const realPnl = r.realized_pnl != null ? Number(r.realized_pnl) : 0;
        const realVol = r.volume != null ? Number(r.volume) : null;
        const idealVol =
          r.position_size_btc != null
            ? Math.round(Number(r.position_size_btc) * SIZE_MULTIPLIER * 100) / 100
            : realVol;

        const scaledPnl =
          realVol && realVol > 0 && idealVol != null
            ? realPnl * (idealVol / realVol)
            : realPnl;

        totalPnl += scaledPnl;

        // R multiple from analysis_rr (format "1:2.14")
        const rrStr = r.analysis_rr as string | null;
        let rrValue: number | null = null;
        if (rrStr && rrStr.includes(':')) {
          const parsed = parseFloat(rrStr.split(':')[1]);
          if (!isNaN(parsed)) rrValue = parsed;
        }

        if (r.exit_reason === 'TP' && rrValue != null) {
          totalR += rrValue;
          winRSum += rrValue;
          winCount++;
        } else if (r.exit_reason === 'SL') {
          totalR += -1; // 1R loss
        }
      }
    }

    const decided = tp + sl;
    const winRate = decided > 0 ? (tp / decided) * 100 : 0;
    const avgWinR = winCount > 0 ? winRSum / winCount : null;

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
    });
  } catch (err) {
    console.error('orders-stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
