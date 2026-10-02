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

function pick(map, value, field, errors) {
  const v = map[fold(value)]
  if (v === undefined) errors.push(`${field}: gecersiz deger ${JSON.stringify(value)} (beklenen: ${Object.keys(map).join(' | ')})`)
  return v
}

function validate(file, j) {
  const errors = []
  const base = path.basename(file, '.json')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) errors.push(`dosya adi YYYY-MM-DD.json olmali`)
  if (j.run_date !== base) errors.push(`run_date (${j.run_date}) dosya adiyla (${base}) ayni olmali`)
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
  console.log(`✓ ${row.run_date}  ${row.bias.padEnd(7)} ${row.confidence.padEnd(6)} skor=${row.sentiment_score}  (${row.net_direction})`)
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
    const upd = cols.filter(c => c !== 'run_date').map(c => `${c} = EXCLUDED.${c}`).join(', ')
    await client.query(
      `INSERT INTO btc_daily_bias (${cols.join(', ')}) VALUES (${ph})
       ON CONFLICT (run_date) DO UPDATE SET ${upd}, updated_at = now()
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
