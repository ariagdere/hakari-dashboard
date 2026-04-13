import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [dirSentRows, scoreSentRows, topPairsRows] = await Promise.all([
    pool.query(`
      SELECT
        direction,
        sent_synthesis_mtf AS mtf_strength,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate
      FROM btc_analysis
      WHERE direction IN ('LONG','SHORT')
        AND sent_synthesis_mtf IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY direction, sent_synthesis_mtf
      ORDER BY direction, win_rate DESC
    `),

    pool.query(`
      SELECT
        CASE
          WHEN market_score_value <= 4 THEN 'Düşük (1-4)'
          WHEN market_score_value BETWEEN 5 AND 7 THEN 'Orta (5-7)'
          ELSE 'Yüksek (8-10)'
        END AS score_bucket,
        sent_synthesis_mtf AS mtf_strength,
        COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
        COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins,
        ROUND(
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')), 0), 1
        ) AS win_rate
      FROM btc_analysis
      WHERE market_score_value IS NOT NULL
        AND sent_synthesis_mtf IS NOT NULL
        AND sim_result IN ('TP_HIT','SL_HIT')
      GROUP BY score_bucket, sent_synthesis_mtf
      ORDER BY score_bucket, win_rate DESC
    `),

    pool.query(`
      WITH pairs AS (
        SELECT 'direction × mtf synthesis' AS pair_name,
          direction || ' + mtf=' || sent_synthesis_mtf AS combination,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins
        FROM btc_analysis
        WHERE direction IS NOT NULL AND sent_synthesis_mtf IS NOT NULL
        GROUP BY direction, sent_synthesis_mtf

        UNION ALL

        SELECT 'direction × liquidity',
          direction || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction IS NOT NULL AND sent_liquidity IS NOT NULL
        GROUP BY direction, sent_liquidity

        UNION ALL

        SELECT 'direction × market power',
          direction || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction IS NOT NULL AND sent_market_power IS NOT NULL
        GROUP BY direction, sent_market_power

        UNION ALL

        SELECT 'direction × h1 tt positions',
          direction || ' + h1_ttp=' || sent_h1_tt_positions,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction IS NOT NULL AND sent_h1_tt_positions IS NOT NULL
        GROUP BY direction, sent_h1_tt_positions

        UNION ALL

        SELECT 'direction × m5 tt positions',
          direction || ' + m5_ttp=' || sent_m5_tt_positions,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction IS NOT NULL AND sent_m5_tt_positions IS NOT NULL
        GROUP BY direction, sent_m5_tt_positions

        UNION ALL

        SELECT 'direction × h1 oi',
          direction || ' + h1_oi=' || sent_h1_oi,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction IS NOT NULL AND sent_h1_oi IS NOT NULL
        GROUP BY direction, sent_h1_oi

        UNION ALL

        SELECT 'score bucket × mtf synthesis',
          CASE WHEN market_score_value <= 4 THEN 'score=low'
               WHEN market_score_value <= 7 THEN 'score=mid'
               ELSE 'score=high' END || ' + mtf=' || sent_synthesis_mtf,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE market_score_value IS NOT NULL AND sent_synthesis_mtf IS NOT NULL
        GROUP BY
          CASE WHEN market_score_value <= 4 THEN 'score=low'
               WHEN market_score_value <= 7 THEN 'score=mid'
               ELSE 'score=high' END,
          sent_synthesis_mtf
      )
      SELECT
        pair_name,
        combination,
        total,
        wins,
        ROUND(wins * 100.0 / NULLIF(total, 0), 1) AS win_rate
      FROM pairs
      WHERE total >= 5
      ORDER BY win_rate DESC, total DESC
      LIMIT 10
    `),
  ])

  return NextResponse.json({
    direction_x_sentiment: dirSentRows.rows,
    score_x_sentiment: scoreSentRows.rows,
    top_pairs: topPairsRows.rows,
  })
}
