import { NextRequest } from 'next/server'

export function buildInsightsWhere(req: NextRequest): { where: string; params: any[] } {
  const s = req.nextUrl.searchParams
  const conditions: string[] = []
  const params: any[] = []
  let i = 1

  const p = (col: string, val: string | null) => {
    if (val) { conditions.push(`${col} = $${i++}`); params.push(val) }
  }
  const range = (col: string, minVal: string | null, maxVal: string | null, defaultMin: number, defaultMax: number) => {
    const mn = minVal ? Number(minVal) : defaultMin
    const mx = maxVal ? Number(maxVal) : defaultMax
    if (mn !== defaultMin) { conditions.push(`${col} >= $${i++}`); params.push(mn) }
    if (mx !== defaultMax) { conditions.push(`${col} <= $${i++}`); params.push(mx) }
  }

  p('direction',        s.get('direction'))
  p('sim_result',       s.get('sim_result'))
  p('order_type',       s.get('order_type'))
  p('sequential_trade', s.get('sequential_trade'))

  const dateFrom = s.get('date_from')
  const dateTo   = s.get('date_to')
  if (dateFrom) { conditions.push(`analyzed_at >= $${i++}`); params.push(dateFrom) }
  if (dateTo)   { conditions.push(`analyzed_at <= $${i++}`); params.push(dateTo + 'T23:59:59') }

  range('market_score_value',       s.get('score_min'), s.get('score_max'), 1,   10)
  range('confidence_value',         s.get('conf_min'),  s.get('conf_max'),  0,   100)
  range('rsi_4h',                   s.get('rsi_min'),   s.get('rsi_max'),   0,   100)
  range('sim_r_multiple',           s.get('r_min'),     s.get('r_max'),     -5,  20)

  const sentFields = [
    'sent_synthesis_mtf','sent_synthesis_h1','sent_synthesis_m5',
    'sent_h1_ls_ratio','sent_h1_tt_accounts','sent_h1_tt_positions',
    'sent_h1_oi','sent_h1_oi_mcap',
    'sent_m5_ls_ratio','sent_m5_tt_accounts','sent_m5_tt_positions',
    'sent_m5_oi','sent_m5_oi_mcap',
    'sent_liquidity','sent_market_power',
  ]
  sentFields.forEach(f => p(f, s.get(f)))

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}
