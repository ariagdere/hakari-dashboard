import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Acc {
  magic: number;
  strategy_label: string;
  total: number;
  open: number;
  pending: number;
  expired: number;
  closed: number;
  tp: number;
  sl: number;
  totalPnl: number;
  totalR: number;
  winRSum: number;
  winCount: number;
  durationSumMs: number;
  durationCount: number;
  wpSum: number;
  wpCount: number;
  // kapanan islemlerin kronolojik R serisi (drawdown icin)
  closedSeries: Array<{ t: number; r: number }>;
}

function maxDrawdown(series: Array<{ t: number; r: number }>): number {
  // kronolojik sirala, kumulatif R egrisinde tepe-dip farki
  const sorted = series.slice().sort((a, b) => a.t - b.t);
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  for (const s of sorted) {
    cum += s.r;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.magic, o.strategy_label, o.status, o.exit_reason, o.is_manual,
        o.realized_pnl, o.volume, o.opened_at, o.closed_at, o.r_target, o.r_risk,
        a.win_probability_v6
      FROM orders o
      LEFT JOIN btc_analysis a ON a.id = o.analysis_id
    `);

    const map = new Map<string, Acc>();
    const keyOf = (r: any) => `${r.magic}|${r.strategy_label}`;

    for (const r of rows) {
      const key = keyOf(r);
      if (!map.has(key)) {
        map.set(key, {
          magic: Number(r.magic), strategy_label: r.strategy_label,
          total: 0, open: 0, pending: 0, expired: 0, closed: 0,
          tp: 0, sl: 0, totalPnl: 0, totalR: 0, winRSum: 0, winCount: 0,
          durationSumMs: 0, durationCount: 0, wpSum: 0, wpCount: 0, closedSeries: [],
        });
      }
      const acc = map.get(key)!;
      acc.total++;

      // tahmin WP (predicted)
      if (r.win_probability_v6 != null) {
        acc.wpSum += Number(r.win_probability_v6);
        acc.wpCount++;
      }

      if (r.status === 'PENDING') acc.pending++;
      else if (r.status === 'OPEN') acc.open++;
      else if (r.status === 'CANCELED') {
        if (r.exit_reason === 'EXPIRED') acc.expired++;
      } else if (r.status === 'CLOSED') {
        acc.closed++;
        if (r.exit_reason === 'TP') acc.tp++;
        else if (r.exit_reason === 'SL') acc.sl++;

        // Gercek realized PnL kullan
        const realPnl = r.realized_pnl != null ? Number(r.realized_pnl) : 0;
        acc.totalPnl += realPnl;

        // R: orders.r_target / r_risk (analysis'in orijinal risk mesafesine gore)
        const rTarget = r.r_target != null ? Number(r.r_target) : null;
        const rRisk = r.r_risk != null ? Number(r.r_risk) : 1;
        let rVal = 0;
        if (r.exit_reason === 'TP' && rTarget != null) {
          rVal = rTarget; acc.winRSum += rTarget; acc.winCount++;
        } else if (r.exit_reason === 'SL') {
          rVal = -rRisk;
        }
        acc.totalR += rVal;

        // sure
        if (r.opened_at && r.closed_at) {
          const dur = new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime();
          if (dur > 0) { acc.durationSumMs += dur; acc.durationCount++; }
        }

        // drawdown serisi
        if (r.closed_at) {
          acc.closedSeries.push({ t: new Date(r.closed_at).getTime(), r: rVal });
        }
      }
    }

    const result = Array.from(map.values()).map((a) => {
      const decided = a.tp + a.sl;
      const winRate = decided > 0 ? (a.tp / decided) * 100 : null;
      const avgWinR = a.winCount > 0 ? a.winRSum / a.winCount : null;
      const avgDurMin = a.durationCount > 0 ? a.durationSumMs / a.durationCount / 60000 : null;
      const avgWp = a.wpCount > 0 ? a.wpSum / a.wpCount : null;
      const dd = maxDrawdown(a.closedSeries);

      return {
        magic: a.magic,
        strategy_label: a.strategy_label,
        total: a.total,
        open: a.open,
        pending: a.pending,
        expired: a.expired,
        closed: a.closed,
        tp_count: a.tp,
        sl_count: a.sl,
        win_rate: winRate != null ? Number(winRate.toFixed(1)) : null,
        avg_win_r: avgWinR != null ? Number(avgWinR.toFixed(2)) : null,
        total_r: Number(a.totalR.toFixed(2)),
        total_pnl: Number(a.totalPnl.toFixed(2)),
        avg_duration_min: avgDurMin != null ? Math.round(avgDurMin) : null,
        max_drawdown_r: Number(dd.toFixed(2)),
        avg_wp_v6: avgWp != null ? Number(avgWp.toFixed(1)) : null, // tahmin
        // kalibrasyon farki: gercek WR - tahmin WP (pozitif = tahminden iyi)
        calibration_gap: winRate != null && avgWp != null ? Number((winRate - avgWp).toFixed(1)) : null,
      };
    });

    // total order'a gore azalan sirala
    result.sort((x, y) => y.total - x.total);

    return NextResponse.json(result);
  } catch (err) {
    console.error('strategy-comparison error:', err);
    return NextResponse.json({ error: 'Failed to fetch comparison' }, { status: 500 });
  }
}
