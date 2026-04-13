import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [dirSentRows, scoreSentRows, longPairs, shortPairs, longTrios, shortTrios] = await Promise.all([

    // Direction × MTF synthesis (existing — kept for overview cards)
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

    // Score bucket × MTF synthesis (existing — kept for overview cards)
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

    // LONG — top signal pairs (direction excluded)
    pool.query(`
      WITH pairs AS (
        SELECT 'mtf × h1_ttp' AS pair_name,
          'mtf=' || sent_synthesis_mtf || ' + h1_ttp=' || sent_h1_tt_positions AS combination,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_synthesis_mtf IS NOT NULL AND sent_h1_tt_positions IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_tt_positions

        UNION ALL

        SELECT 'mtf × m5_ttp',
          'mtf=' || sent_synthesis_mtf || ' + m5_ttp=' || sent_m5_tt_positions,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_synthesis_mtf IS NOT NULL AND sent_m5_tt_positions IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_m5_tt_positions

        UNION ALL

        SELECT 'mtf × h1_oi',
          'mtf=' || sent_synthesis_mtf || ' + h1_oi=' || sent_h1_oi,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_synthesis_mtf IS NOT NULL AND sent_h1_oi IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_oi

        UNION ALL

        SELECT 'mtf × liquidity',
          'mtf=' || sent_synthesis_mtf || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_synthesis_mtf IS NOT NULL AND sent_liquidity IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_liquidity

        UNION ALL

        SELECT 'mtf × market_power',
          'mtf=' || sent_synthesis_mtf || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_synthesis_mtf IS NOT NULL AND sent_market_power IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_market_power

        UNION ALL

        SELECT 'h1_ttp × m5_ttp',
          'h1_ttp=' || sent_h1_tt_positions || ' + m5_ttp=' || sent_m5_tt_positions,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_h1_tt_positions IS NOT NULL AND sent_m5_tt_positions IS NOT NULL
        GROUP BY sent_h1_tt_positions, sent_m5_tt_positions

        UNION ALL

        SELECT 'h1_oi × m5_oi',
          'h1_oi=' || sent_h1_oi || ' + m5_oi=' || sent_m5_oi,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_h1_oi IS NOT NULL AND sent_m5_oi IS NOT NULL
        GROUP BY sent_h1_oi, sent_m5_oi

        UNION ALL

        SELECT 'liquidity × market_power',
          'liq=' || sent_liquidity || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_liquidity IS NOT NULL AND sent_market_power IS NOT NULL
        GROUP BY sent_liquidity, sent_market_power

        UNION ALL

        SELECT 'h1_ttp × liquidity',
          'h1_ttp=' || sent_h1_tt_positions || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG' AND sent_h1_tt_positions IS NOT NULL AND sent_liquidity IS NOT NULL
        GROUP BY sent_h1_tt_positions, sent_liquidity
      )
      SELECT pair_name, combination, total, wins,
        ROUND(wins * 100.0 / NULLIF(total, 0), 1) AS win_rate
      FROM pairs
      WHERE total >= 5
      ORDER BY win_rate DESC, total DESC
      LIMIT 8
    `),

    // SHORT — top signal pairs (direction excluded)
    pool.query(`
      WITH pairs AS (
        SELECT 'mtf × h1_ttp' AS pair_name,
          'mtf=' || sent_synthesis_mtf || ' + h1_ttp=' || sent_h1_tt_positions AS combination,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_synthesis_mtf IS NOT NULL AND sent_h1_tt_positions IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_tt_positions

        UNION ALL

        SELECT 'mtf × m5_ttp',
          'mtf=' || sent_synthesis_mtf || ' + m5_ttp=' || sent_m5_tt_positions,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_synthesis_mtf IS NOT NULL AND sent_m5_tt_positions IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_m5_tt_positions

        UNION ALL

        SELECT 'mtf × h1_oi',
          'mtf=' || sent_synthesis_mtf || ' + h1_oi=' || sent_h1_oi,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_synthesis_mtf IS NOT NULL AND sent_h1_oi IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_oi

        UNION ALL

        SELECT 'mtf × liquidity',
          'mtf=' || sent_synthesis_mtf || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_synthesis_mtf IS NOT NULL AND sent_liquidity IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_liquidity

        UNION ALL

        SELECT 'mtf × market_power',
          'mtf=' || sent_synthesis_mtf || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_synthesis_mtf IS NOT NULL AND sent_market_power IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_market_power

        UNION ALL

        SELECT 'h1_ttp × m5_ttp',
          'h1_ttp=' || sent_h1_tt_positions || ' + m5_ttp=' || sent_m5_tt_positions,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_h1_tt_positions IS NOT NULL AND sent_m5_tt_positions IS NOT NULL
        GROUP BY sent_h1_tt_positions, sent_m5_tt_positions

        UNION ALL

        SELECT 'h1_oi × m5_oi',
          'h1_oi=' || sent_h1_oi || ' + m5_oi=' || sent_m5_oi,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_h1_oi IS NOT NULL AND sent_m5_oi IS NOT NULL
        GROUP BY sent_h1_oi, sent_m5_oi

        UNION ALL

        SELECT 'liquidity × market_power',
          'liq=' || sent_liquidity || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_liquidity IS NOT NULL AND sent_market_power IS NOT NULL
        GROUP BY sent_liquidity, sent_market_power

        UNION ALL

        SELECT 'h1_ttp × liquidity',
          'h1_ttp=' || sent_h1_tt_positions || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT' AND sent_h1_tt_positions IS NOT NULL AND sent_liquidity IS NOT NULL
        GROUP BY sent_h1_tt_positions, sent_liquidity
      )
      SELECT pair_name, combination, total, wins,
        ROUND(wins * 100.0 / NULLIF(total, 0), 1) AS win_rate
      FROM pairs
      WHERE total >= 5
      ORDER BY win_rate DESC, total DESC
      LIMIT 8
    `),

    // LONG — top trios
    pool.query(`
      WITH trios AS (
        SELECT
          'mtf × h1_ttp × m5_ttp' AS trio_name,
          'mtf=' || sent_synthesis_mtf || ' + h1_ttp=' || sent_h1_tt_positions || ' + m5_ttp=' || sent_m5_tt_positions AS combination,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins
        FROM btc_analysis
        WHERE direction = 'LONG'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_h1_tt_positions IS NOT NULL
          AND sent_m5_tt_positions IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_tt_positions, sent_m5_tt_positions

        UNION ALL

        SELECT
          'mtf × h1_oi × liquidity',
          'mtf=' || sent_synthesis_mtf || ' + h1_oi=' || sent_h1_oi || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_h1_oi IS NOT NULL
          AND sent_liquidity IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_oi, sent_liquidity

        UNION ALL

        SELECT
          'mtf × liquidity × market_power',
          'mtf=' || sent_synthesis_mtf || ' + liq=' || sent_liquidity || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_liquidity IS NOT NULL
          AND sent_market_power IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_liquidity, sent_market_power

        UNION ALL

        SELECT
          'h1_ttp × m5_ttp × liquidity',
          'h1_ttp=' || sent_h1_tt_positions || ' + m5_ttp=' || sent_m5_tt_positions || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG'
          AND sent_h1_tt_positions IS NOT NULL
          AND sent_m5_tt_positions IS NOT NULL
          AND sent_liquidity IS NOT NULL
        GROUP BY sent_h1_tt_positions, sent_m5_tt_positions, sent_liquidity

        UNION ALL

        SELECT
          'mtf × h1_ttp × market_power',
          'mtf=' || sent_synthesis_mtf || ' + h1_ttp=' || sent_h1_tt_positions || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'LONG'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_h1_tt_positions IS NOT NULL
          AND sent_market_power IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_tt_positions, sent_market_power
      )
      SELECT trio_name, combination, total, wins,
        ROUND(wins * 100.0 / NULLIF(total, 0), 1) AS win_rate
      FROM trios
      WHERE total >= 5
      ORDER BY win_rate DESC, total DESC
      LIMIT 6
    `),

    // SHORT — top trios
    pool.query(`
      WITH trios AS (
        SELECT
          'mtf × h1_ttp × m5_ttp' AS trio_name,
          'mtf=' || sent_synthesis_mtf || ' + h1_ttp=' || sent_h1_tt_positions || ' + m5_ttp=' || sent_m5_tt_positions AS combination,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')) AS total,
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT') AS wins
        FROM btc_analysis
        WHERE direction = 'SHORT'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_h1_tt_positions IS NOT NULL
          AND sent_m5_tt_positions IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_tt_positions, sent_m5_tt_positions

        UNION ALL

        SELECT
          'mtf × h1_oi × liquidity',
          'mtf=' || sent_synthesis_mtf || ' + h1_oi=' || sent_h1_oi || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_h1_oi IS NOT NULL
          AND sent_liquidity IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_oi, sent_liquidity

        UNION ALL

        SELECT
          'mtf × liquidity × market_power',
          'mtf=' || sent_synthesis_mtf || ' + liq=' || sent_liquidity || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_liquidity IS NOT NULL
          AND sent_market_power IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_liquidity, sent_market_power

        UNION ALL

        SELECT
          'h1_ttp × m5_ttp × liquidity',
          'h1_ttp=' || sent_h1_tt_positions || ' + m5_ttp=' || sent_m5_tt_positions || ' + liq=' || sent_liquidity,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT'
          AND sent_h1_tt_positions IS NOT NULL
          AND sent_m5_tt_positions IS NOT NULL
          AND sent_liquidity IS NOT NULL
        GROUP BY sent_h1_tt_positions, sent_m5_tt_positions, sent_liquidity

        UNION ALL

        SELECT
          'mtf × h1_ttp × market_power',
          'mtf=' || sent_synthesis_mtf || ' + h1_ttp=' || sent_h1_tt_positions || ' + mktpwr=' || sent_market_power,
          COUNT(*) FILTER (WHERE sim_result IN ('TP_HIT','SL_HIT')),
          COUNT(*) FILTER (WHERE sim_result = 'TP_HIT')
        FROM btc_analysis
        WHERE direction = 'SHORT'
          AND sent_synthesis_mtf IS NOT NULL
          AND sent_h1_tt_positions IS NOT NULL
          AND sent_market_power IS NOT NULL
        GROUP BY sent_synthesis_mtf, sent_h1_tt_positions, sent_market_power
      )
      SELECT trio_name, combination, total, wins,
        ROUND(wins * 100.0 / NULLIF(total, 0), 1) AS win_rate
      FROM trios
      WHERE total >= 5
      ORDER BY win_rate DESC, total DESC
      LIMIT 6
    `),
  ])

  return NextResponse.json({
    direction_x_sentiment: dirSentRows.rows,
    score_x_sentiment: scoreSentRows.rows,
    long_pairs: longPairs.rows,
    short_pairs: shortPairs.rows,
    long_trios: longTrios.rows,
    short_trios: shortTrios.rows,
  })
}
