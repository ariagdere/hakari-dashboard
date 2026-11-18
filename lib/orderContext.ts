// Order'lara haber (red folder) ve gunluk bias eslestirmesi. orders tablosuna YAZILMAZ; her sorguda
// red_folder_events ve btc_daily_bias'tan hesaplanir. Boylece eski, yeni ya da mutabakatla eklenen her
// order bu tablolarin o anki haliyle eslesir: gec yuklenen bir bias raporu ya da yeni yilin haber
// takvimi geriye donuk da yansir, ayrica bir backfill ya da monitor degisikligi gerekmez.
// (orders.red_folder_* kolonlari yalnizca tek seferlik backfill'le dolmustu; monitor yeni order'lara
// hic yazmadigi icin eskiyordu. Artik okunmuyorlar.)
//
// Kullanim (o = orders):
//   FROM orders o ${ORDER_TIME_JOIN} ${RED_FOLDER_JOINS} ${BIAS_JOIN} ...
//   SELECT ..., ${RED_FOLDER_COLUMNS}, ${BIAS_COLUMNS}

// Order ani: bilinen en erken an -- LSR acilariyla ayni kural (lib/orderAngles.ts, fill-angles route'u).
// Mutabakatin eski surumu created_at'e mutabakat anini yaziyordu; o order'larda acilis ani daha erken.
export const ORDER_TIME_JOIN = `
  CROSS JOIN LATERAL (SELECT LEAST(o.created_at, o.opened_at) AS t) ctx_t`

// Red folder: order'in Istanbul takvim gunundeki haberlerden order anina EN YAKIN olani
// (red_folder_backfill.py ile ayni kural). hours_diff isaretli saat: + = order haberden SONRA, - = ONCE.
// O gun haber yoksa same_day=false. Order'in yili icin takvim hic yuklenmemisse (or. yeni yilin Excel'i
// gelmeden) uc alan da NULL: "haber yok" ile "bilinmiyor" karismasin.
export const RED_FOLDER_JOINS = `
  LEFT JOIN LATERAL (
    SELECT e.event_name, ROUND((EXTRACT(EPOCH FROM (ctx_t.t - e.event_at)) / 3600.0)::numeric, 2) AS hours_diff
      FROM red_folder_events e
     WHERE e.event_date = (ctx_t.t AT TIME ZONE 'Europe/Istanbul')::date
     ORDER BY abs(EXTRACT(EPOCH FROM (ctx_t.t - e.event_at))), e.event_at
     LIMIT 1
  ) ctx_rf ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM red_folder_events y
       WHERE date_part('year', y.event_date) = date_part('year', ctx_t.t AT TIME ZONE 'Europe/Istanbul')
    ) AS covered
  ) ctx_rfy ON true`

export const RED_FOLDER_COLUMNS = `
  CASE WHEN ctx_rfy.covered THEN ctx_rf.event_name IS NOT NULL END AS red_folder_same_day,
  ctx_rf.event_name AS red_folder_event_name,
  ctx_rf.hours_diff AS red_folder_hours_diff`

// Bias: order anindan ONCE uretilmis en son rapor (gunde birden fazla calisma olabilir; hafta sonu ve
// pazartesi 09:07'den once cuma raporu gecerlidir). generated_at routine'in raporu damgaladigi an; rapor
// eski DB'ye bundan 1-2 dk sonra yazilir. Hangi raporla eslestigi bias_report_at'ten gorulur.
export const BIAS_JOIN = `
  LEFT JOIN LATERAL (
    SELECT b.generated_at, b.bias, b.confidence, b.sentiment_score, b.liquidity_regime, b.risk_regime
      FROM btc_daily_bias b
     WHERE b.generated_at <= ctx_t.t
     ORDER BY b.generated_at DESC
     LIMIT 1
  ) ctx_bias ON true`

export const BIAS_COLUMNS = `
  ctx_bias.generated_at AS bias_report_at, ctx_bias.bias AS bias, ctx_bias.confidence AS bias_confidence,
  ctx_bias.sentiment_score AS bias_score, ctx_bias.liquidity_regime AS bias_liquidity_regime,
  ctx_bias.risk_regime AS bias_risk_regime`
