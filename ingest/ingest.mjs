// BTC Daily Bias -> Postgres ingest.
// data/daily-bias/*.json dosyalarinin TAMAMINI dogrular ve btc_daily_bias tablosuna UPSERT eder.
// Idempotent: her calismada hepsini yeniden yazmak zararsiz, kacan bir gun bir sonraki calismada telafi edilir.
//
// Kullanim:
//   DATABASE_URL=... node ingest/ingest.mjs            -> dogrula + yaz
//   node ingest/ingest.mjs --dry-run [dosya...]          -> sadece dogrula (DB gerekmez)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data', 'daily-bias')
const SCHEMA = fs.readFileSync(path.join(ROOT, 'ingest', 'schema.sql'), 'utf8')

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const explicitFiles = args.filter(a => !a.startsWith('--'))

// ─── Normalizasyon ──────────────────────────────────────────────────────────
const fold = s => String(s ?? '').trim().toLocaleLowerCase('tr')
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[\s_-]+/g, ' ')

const NET_DIRECTION = {
  'guclu pozitif': ['Güçlü Pozitif', 3], 'pozitif': ['Pozitif', 2], 'hafif pozitif': ['Hafif Pozitif', 1],
  'notr': ['Nötr', 0],
  'hafif negatif': ['Hafif Negatif', -1], 'negatif': ['Negatif', -2], 'guclu negatif': ['Güçlü Negatif', -3],
}
const CHANGE = { 'iyilesti': 'IMPROVED', 'improved': 'IMPROVED', 'degismedi': 'UNCHANGED', 'unchanged': 'UNCHANGED', 'kotulesti': 'WORSENED', 'worsened': 'WORSENED' }
const DIVERGENCE = { 'relative strength': 'RELATIVE_STRENGTH', 'relative weakness': 'RELATIVE_WEAKNESS', 'aligned': 'ALIGNED', 'uyumlu': 'ALIGNED' }
const LIQUIDITY = { 'sikilasiyor': 'TIGHTENING', 'tightening': 'TIGHTENING', 'notr': 'NEUTRAL', 'neutral': 'NEUTRAL', 'gevsiyor': 'EASING', 'easing': 'EASING', 'guclu sekilde genisliyor': 'STRONG_EXPANSION', 'strong expansion': 'STRONG_EXPANSION' }
const RISK = { 'risk on': 'RISK_ON', 'temkinli risk on': 'CAUTIOUS_RISK_ON', 'cautious risk on': 'CAUTIOUS_RISK_ON', 'notr': 'NEUTRAL', 'neutral': 'NEUTRAL', 'temkinli risk off': 'CAUTIOUS_RISK_OFF', 'cautious risk off': 'CAUTIOUS_RISK_OFF', 'risk off': 'RISK_OFF' }
const BIAS = { 'long': 'LONG', 'neutral': 'NEUTRAL', 'notr': 'NEUTRAL', 'short': 'SHORT' }
const CONFIDENCE = { 'dusuk': 'LOW', 'low': 'LOW', 'orta': 'MEDIUM', 'medium': 'MEDIUM', 'yuksek': 'HIGH', 'high': 'HIGH' }
const IMPACT = { 'pozitif': 'POSITIVE', 'positive': 'POSITIVE', 'notr': 'NEUTRAL', 'neutral': 'NEUTRAL', 'negatif': 'NEGATIVE', 'negative': 'NEGATIVE' }

// Varlik guc siralamasi: 7 varligin hepsi, her biri bir kez. Anahtarlar fold() sonrasi yazimlar.
const ASSET_ORDER = ['BTC', 'DXY', 'XAUUSD', 'VIX', 'NASDAQ', 'SPX', 'BRENT']
const ASSETS = {
  'btc': 'BTC', 'bitcoin': 'BTC', 'btcusd': 'BTC', 'btc/usd': 'BTC', 'btcusdt': 'BTC',
  'dxy': 'DXY', 'dolar endeksi': 'DXY', 'dollar index': 'DXY', 'us dollar index': 'DXY',
  'xauusd': 'XAUUSD', 'xau/usd': 'XAUUSD', 'xau': 'XAUUSD', 'altin': 'XAUUSD', 'gold': 'XAUUSD',
  'vix': 'VIX',
  'nasdaq': 'NASDAQ', 'nasdaq 100': 'NASDAQ', 'nasdaq100': 'NASDAQ', 'ndx': 'NASDAQ', 'nq': 'NASDAQ', 'ixic': 'NASDAQ', 'nasdaq composite': 'NASDAQ',
  'spx': 'SPX', 's&p 500': 'SPX', 's&p500': 'SPX', 'sp500': 'SPX', 'sp 500': 'SPX', 'es': 'SPX',
  'brent': 'BRENT', 'brent petrol': 'BRENT', 'brent crude': 'BRENT', 'brent oil': 'BRENT', 'ukoil': 'BRENT',
}

function validateStrength(list, errors) {
  if (list == null) return null // eski calismalarda alan yok
  if (!Array.isArray(list)) { errors.push('asset_strength dizi olmali'); return null }
  const seen = new Set()
  const items = []
  list.forEach((a, i) => {
    const f = `asset_strength[${i}]`
    const asset = ASSETS[fold(a?.asset)]
    if (!asset) { errors.push(`${f}.asset: gecersiz varlik ${JSON.stringify(a?.asset)} (beklenen: ${ASSET_ORDER.join(', ')})`); return }
    if (seen.has(asset)) errors.push(`${f}.asset: ${asset} birden fazla kez var`)
    seen.add(asset)
    const score = Number(a?.score)
    if (a?.score == null || a?.score === '' || typeof a?.score === 'boolean' || !Number.isFinite(score) || score < 0 || score > 10)
      errors.push(`${f}.score (${asset}): 0..10 arasi sayi olmali`)
    const reason = typeof a?.reason === 'string' ? a.reason.trim() : ''
    if (!reason) errors.push(`${f}.reason (${asset}): tek cumlelik gerekce zorunlu`)
    const pct = (v, name) => {
      if (v == null || v === '') return null
      const n = Number(v)
      if (typeof v === 'boolean' || !Number.isFinite(n)) { errors.push(`${f}.${name} (${asset}): sayi ya da null olmali`); return null }
      return Math.round(n * 100) / 100
    }
    items.push({
      asset,
      score: Math.round(score * 10) / 10,
      reason,
      chg_24h_pct: pct(a?.chg_24h_pct, 'chg_24h_pct'),
      chg_7d_pct: pct(a?.chg_7d_pct, 'chg_7d_pct'),
    })
  })
  const missing = ASSET_ORDER.filter((a) => !seen.has(a))
  if (missing.length) errors.push(`asset_strength: eksik varlik(lar): ${missing.join(', ')}`)
  // Sirayi model degil puan belirler (gucluden zayifa); esit puanda modelin sirasi korunur (stable sort).
  items.sort((x, y) => y.score - x.score)
  return items.map((it, i) => ({ rank: i + 1, ...it }))
}

function pick(map, value, field, errors) {
  const v = map[fold(value)]
  if (v === undefined) errors.push(`${field}: gecersiz deger ${JSON.stringify(value)} (beklenen: ${Object.keys(map).join(' | ')})`)
  return v
}

function validate(file, j) {
  const errors = []
  const base = path.basename(file, '.json')
  // YYYY-MM-DD (eski, gunde tek) ya da YYYY-MM-DDTHHMM (Istanbul saati, gunde birden fazla)
  const m = base.match(/^(\d{4}-\d{2}-\d{2})(T\d{4})?$/)
  if (!m) errors.push(`dosya adi YYYY-MM-DDTHHMM.json (ya da eski YYYY-MM-DD.json) olmali`)
  else if (j.run_date !== m[1]) errors.push(`run_date (${j.run_date}) dosya adindaki tarihle (${m[1]}) ayni olmali`)
  if (!j.generated_at || isNaN(Date.parse(j.generated_at))) errors.push(`generated_at gecerli bir ISO zaman olmali`)

  const nd = pick(NET_DIRECTION, j.net_direction, 'net_direction', errors)
  const score = Number(j.sentiment_score)
  if (!Number.isInteger(score) || score < -100 || score > 100) errors.push(`sentiment_score -100..100 arasi tam sayi olmali`)

  const drivers = j.drivers
  if (!Array.isArray(drivers) || drivers.length === 0 || drivers.length > 4 || !drivers.every(d => typeof d === 'string' && d.trim()))
    errors.push(`drivers 1-4 elemanli string dizisi olmali`)

  let developments = null
  if (j.developments != null) {
    if (!Array.isArray(j.developments)) errors.push(`developments dizi olmali`)
    else developments = j.developments.map((d, i) => ({ item: String(d?.item ?? '').trim(), impact: pick(IMPACT, d?.impact, `developments[${i}].impact`, errors) }))
  }
  if (typeof j.raw_text !== 'string' || j.raw_text.trim().length < 50) errors.push(`raw_text task'in tam metin ciktisi olmali`)
  const strength = validateStrength(j.asset_strength, errors)

  const row = {
    run_date: j.run_date,
    generated_at: j.generated_at,
    net_direction: nd?.[0],
    net_direction_level: nd?.[1],
    sentiment_score: score,
    change_24h: pick(CHANGE, j.change_24h, 'change_24h', errors),
    drivers: JSON.stringify(drivers),
    developments: developments ? JSON.stringify(developments) : null,
    key_development: j.key_development ?? null,
    divergence: pick(DIVERGENCE, j.divergence, 'divergence', errors),
    divergence_note: j.divergence_note ?? null,
    liquidity_regime: pick(LIQUIDITY, j.liquidity_regime, 'liquidity_regime', errors),
    risk_regime: pick(RISK, j.risk_regime, 'risk_regime', errors),
    conclusion: j.conclusion ?? null,
    bias: pick(BIAS, j.bias, 'bias', errors),
    confidence: pick(CONFIDENCE, j.confidence, 'confidence', errors),
    raw_text: j.raw_text,
    asset_strength: strength ? JSON.stringify(strength) : null,
    model: j.model ?? null,
    prompt_version: j.prompt_version ?? null,
    source_file: path.relative(ROOT, file),
  }
  return { row, errors }
}

// ─── Main ───────────────────────────────────────────────────────────────────
const files = explicitFiles.length
  ? explicitFiles.map(f => path.resolve(f))
  : fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort().map(f => path.join(DATA_DIR, f))

const rows = []
let bad = 0
for (const file of files) {
  let j
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.error(`✗ ${file}: JSON parse hatasi: ${e.message}`); bad++; continue }
  const { row, errors } = validate(file, j)
  if (errors.length) { console.error(`✗ ${path.relative(ROOT, file)}\n  - ${errors.join('\n  - ')}`); bad++; continue }
  rows.push(row)
  const top = row.asset_strength ? JSON.parse(row.asset_strength).map((a) => `${a.asset} ${a.score}`).join(' > ') : '-'
  console.log(`✓ ${path.basename(file)}  ${row.bias.padEnd(7)} ${row.confidence.padEnd(6)} skor=${row.sentiment_score}  (${row.net_direction})  guc: ${top}`)
}
console.log(`${rows.length} gecerli, ${bad} hatali dosya.`)

if (DRY) process.exit(bad ? 1 : 0)
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL tanimli degil.'); process.exit(1) }

const { default: pg } = await import('pg')
const useSsl = process.env.PGSSL === 'true' || /sslmode=require/.test(process.env.DATABASE_URL)
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: useSsl ? { rejectUnauthorized: false } : undefined })
await client.connect()
try {
  await client.query(SCHEMA)
  const cols = Object.keys(rows[0] ?? {})
  for (const r of rows) {
    const vals = cols.map(c => r[c])
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
    const upd = cols.filter(c => c !== 'source_file').map(c => `${c} = EXCLUDED.${c}`).join(', ')
    await client.query(
      `INSERT INTO btc_daily_bias (${cols.join(', ')}) VALUES (${ph})
       ON CONFLICT (source_file) DO UPDATE SET ${upd}, updated_at = now()
       WHERE btc_daily_bias.raw_text IS DISTINCT FROM EXCLUDED.raw_text
          OR btc_daily_bias.generated_at IS DISTINCT FROM EXCLUDED.generated_at`,
      vals,
    )
  }
  const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM btc_daily_bias')
  console.log(`Upsert tamam. Tabloda ${n} satir var.`)
} finally {
  await client.end()
}
process.exit(bad ? 1 : 0)
