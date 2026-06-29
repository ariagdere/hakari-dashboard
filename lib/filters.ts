// lib/filters.ts
// Tek kaynak: Filters tipi, DEFAULT_FILTERS, filtersToParams, activeFilterCount
// Yeni filtre alanı eklerken sadece bu dosyayı düzenle.

export interface Filters {
  direction: string; sim_result: string
  date_from: string; date_to: string
  days: number[]
  rsi_min: number; rsi_max: number
  rsi30_min: number; rsi30_max: number
  wp6_min: number; wp6_max: number
  wp6_rev_min: number; wp6_rev_max: number
  liq_zone: string  // virgülle ayrılmış: 'dn_very_dominant,dn_dominant,...'
  cluster_up_hit: string; cluster_dn_hit: string
  h1_ls_delta_min: number; h1_ls_delta_max: number
  h1_tt_positions_delta_min: number; h1_tt_positions_delta_max: number
  h1_tt_accounts_delta_min: number; h1_tt_accounts_delta_max: number
  h1_oi_delta_min: number; h1_oi_delta_max: number
  h1_oi_mcap_delta_min: number; h1_oi_mcap_delta_max: number
  m5_ls_delta_min: number; m5_ls_delta_max: number
  m5_tt_positions_delta_min: number; m5_tt_positions_delta_max: number
  m5_tt_accounts_delta_min: number; m5_tt_accounts_delta_max: number
  m5_oi_delta_min: number; m5_oi_delta_max: number
  m5_oi_mcap_delta_min: number; m5_oi_mcap_delta_max: number
  sent_synthesis_mtf: string; sent_synthesis_h1: string; sent_synthesis_m5: string
  sent_liquidity: string
  wait_min: number; wait_max: number
  trade_dur_min: number; trade_dur_max: number
  r_min: number; r_max: number
}

export interface Preset { name: string; filters: Filters }

export const DEFAULT_FILTERS: Filters = {
  direction: '', sim_result: '',
  date_from: '', date_to: '',
  days: [0,1,2,3,4,5,6],
  rsi_min: 0, rsi_max: 100,
  rsi30_min: 0, rsi30_max: 100,
  wp6_min: 0, wp6_max: 100,
  wp6_rev_min: 0, wp6_rev_max: 100,
  liq_zone: '',
  cluster_up_hit: '', cluster_dn_hit: '',
  h1_ls_delta_min: -3, h1_ls_delta_max: 3,
  h1_tt_positions_delta_min: -1, h1_tt_positions_delta_max: 1,
  h1_tt_accounts_delta_min: -1, h1_tt_accounts_delta_max: 1,
  h1_oi_delta_min: -20000, h1_oi_delta_max: 20000,
  h1_oi_mcap_delta_min: -0.05, h1_oi_mcap_delta_max: 0.05,
  m5_ls_delta_min: -3, m5_ls_delta_max: 3,
  m5_tt_positions_delta_min: -1, m5_tt_positions_delta_max: 1,
  m5_tt_accounts_delta_min: -1, m5_tt_accounts_delta_max: 1,
  m5_oi_delta_min: -20000, m5_oi_delta_max: 20000,
  m5_oi_mcap_delta_min: -0.05, m5_oi_mcap_delta_max: 0.05,
  sent_synthesis_mtf: '', sent_synthesis_h1: '', sent_synthesis_m5: '',
  sent_liquidity: '',
  wait_min: 0, wait_max: 4320,
  trade_dur_min: 0, trade_dur_max: 4320,
  r_min: 0, r_max: 10,
}

export const FILTERS_STORAGE_KEY = 'hakari_filters'
export const PRESETS_STORAGE_KEY = 'analysis_presets'

export function loadFilters(): Filters {
  try {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
    if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) }
  } catch {}
  return DEFAULT_FILTERS
}

export function saveFilters(f: Filters): void {
  try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f)) } catch {}
}

export function clearFilters(): void {
  try { localStorage.removeItem(FILTERS_STORAGE_KEY) } catch {}
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.direction)   p.set('direction',  f.direction)
  if (f.sim_result)  p.set('sim_result', f.sim_result)
  if (f.date_from)   p.set('date_from',  f.date_from)
  if (f.date_to)     p.set('date_to',    f.date_to)
  if (f.days.length < 7) p.set('days', f.days.join(','))
  p.set('rsi_min', String(f.rsi_min));     p.set('rsi_max', String(f.rsi_max))
  p.set('rsi30_min', String(f.rsi30_min)); p.set('rsi30_max', String(f.rsi30_max))
  p.set('wp6_min', String(f.wp6_min));         p.set('wp6_max', String(f.wp6_max))
  p.set('wp6_rev_min', String(f.wp6_rev_min)); p.set('wp6_rev_max', String(f.wp6_rev_max))
  if (f.liq_zone) p.set('liq_zone', f.liq_zone)
  if (f.cluster_up_hit) p.set('cluster_up_hit', f.cluster_up_hit)
  if (f.cluster_dn_hit) p.set('cluster_dn_hit', f.cluster_dn_hit)
  p.set('h1_ls_delta_min', String(f.h1_ls_delta_min)); p.set('h1_ls_delta_max', String(f.h1_ls_delta_max))
  p.set('h1_tt_positions_delta_min', String(f.h1_tt_positions_delta_min)); p.set('h1_tt_positions_delta_max', String(f.h1_tt_positions_delta_max))
  p.set('h1_tt_accounts_delta_min', String(f.h1_tt_accounts_delta_min)); p.set('h1_tt_accounts_delta_max', String(f.h1_tt_accounts_delta_max))
  p.set('h1_oi_delta_min', String(f.h1_oi_delta_min)); p.set('h1_oi_delta_max', String(f.h1_oi_delta_max))
  p.set('h1_oi_mcap_delta_min', String(f.h1_oi_mcap_delta_min)); p.set('h1_oi_mcap_delta_max', String(f.h1_oi_mcap_delta_max))
  p.set('m5_ls_delta_min', String(f.m5_ls_delta_min)); p.set('m5_ls_delta_max', String(f.m5_ls_delta_max))
  p.set('m5_tt_positions_delta_min', String(f.m5_tt_positions_delta_min)); p.set('m5_tt_positions_delta_max', String(f.m5_tt_positions_delta_max))
  p.set('m5_tt_accounts_delta_min', String(f.m5_tt_accounts_delta_min)); p.set('m5_tt_accounts_delta_max', String(f.m5_tt_accounts_delta_max))
  p.set('m5_oi_delta_min', String(f.m5_oi_delta_min)); p.set('m5_oi_delta_max', String(f.m5_oi_delta_max))
  p.set('m5_oi_mcap_delta_min', String(f.m5_oi_mcap_delta_min)); p.set('m5_oi_mcap_delta_max', String(f.m5_oi_mcap_delta_max))
  if (f.sent_synthesis_mtf) p.set('sent_synthesis_mtf', f.sent_synthesis_mtf)
  if (f.sent_synthesis_h1)  p.set('sent_synthesis_h1',  f.sent_synthesis_h1)
  if (f.sent_synthesis_m5)  p.set('sent_synthesis_m5',  f.sent_synthesis_m5)
  if (f.sent_liquidity)     p.set('sent_liquidity',     f.sent_liquidity)
  p.set('wait_min', String(f.wait_min));           p.set('wait_max', String(f.wait_max))
  p.set('trade_dur_min', String(f.trade_dur_min)); p.set('trade_dur_max', String(f.trade_dur_max))
  p.set('r_min', String(f.r_min));                 p.set('r_max', String(f.r_max))
  return p
}

export function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.direction) n++; if (f.sim_result) n++
  if (f.date_from || f.date_to) n++
  if (f.days.length < 7) n++
  if (f.rsi_min > 0 || f.rsi_max < 100) n++
  if (f.rsi30_min > 0 || f.rsi30_max < 100) n++
  if (f.wp6_min > 0 || f.wp6_max < 100) n++
  if (f.wp6_rev_min > 0 || f.wp6_rev_max < 100) n++
  if (f.liq_zone) n++
  if (f.cluster_up_hit) n++
  if (f.cluster_dn_hit) n++
  if (f.h1_ls_delta_min > -3 || f.h1_ls_delta_max < 3) n++
  if (f.h1_tt_positions_delta_min > -1 || f.h1_tt_positions_delta_max < 1) n++
  if (f.h1_tt_accounts_delta_min > -1 || f.h1_tt_accounts_delta_max < 1) n++
  if (f.h1_oi_delta_min > -20000 || f.h1_oi_delta_max < 20000) n++
  if (f.h1_oi_mcap_delta_min > -0.05 || f.h1_oi_mcap_delta_max < 0.05) n++
  if (f.m5_ls_delta_min > -3 || f.m5_ls_delta_max < 3) n++
  if (f.m5_tt_positions_delta_min > -1 || f.m5_tt_positions_delta_max < 1) n++
  if (f.m5_tt_accounts_delta_min > -1 || f.m5_tt_accounts_delta_max < 1) n++
  if (f.m5_oi_delta_min > -20000 || f.m5_oi_delta_max < 20000) n++
  if (f.m5_oi_mcap_delta_min > -0.05 || f.m5_oi_mcap_delta_max < 0.05) n++
  if (f.sent_synthesis_mtf) n++; if (f.sent_synthesis_h1) n++
  if (f.sent_synthesis_m5) n++; if (f.sent_liquidity) n++
  if (f.wait_min > 0 || f.wait_max < 4320) n++
  if (f.trade_dur_min > 0 || f.trade_dur_max < 4320) n++
  if (f.r_min > 0 || f.r_max < 10) n++
  return n
}
