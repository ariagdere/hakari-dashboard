// Routine yardimcisi: modelin yazdigi TASLAK JSON'a zaman damgalarini SISTEM SAATINDEN basar,
// dosyayi data/daily-bias/<RUN_DATE>T<RUN_HHMM>.json olarak yazar ve ingest dogrulamasindan gecirir.
// Model saati tahmin etmesin diye var: run_date / generated_at / dosya adi her zaman koddan gelir.
//
// Kullanim: node ingest/stamp.mjs <taslak.json>
// Basarida son satir yazilan dosyanin yolu (bias-data'ya gore, orn. data/daily-bias/2026-10-03T0907.json).
// Dogrulama hatasinda hicbir dosya yazilmaz, exit 1; taslagi duzeltip tekrar calistir.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const draftPath = process.argv[2]
if (!draftPath) { console.error('Kullanim: node ingest/stamp.mjs <taslak.json>'); process.exit(2) }

let draft
try { draft = JSON.parse(fs.readFileSync(draftPath, 'utf8')) } catch (e) { console.error(`Taslak okunamadi: ${e.message}`); process.exit(1) }

const now = new Date()
const ist = new Date(now.getTime() + 3 * 3600 * 1000).toISOString() // Istanbul sabit UTC+3 (sistemin geri kalaniyla ayni)
const runDate = ist.slice(0, 10)
const runHHMM = ist.slice(11, 16).replace(':', '')
const generatedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z')

for (const [k, v] of [['run_date', runDate], ['generated_at', generatedAt]]) {
  if (draft[k] != null && draft[k] !== v) console.log(`not: taslaktaki ${k}=${draft[k]} yok sayildi, sistem saati kullanildi (${v})`)
}
const out = { run_date: runDate, generated_at: generatedAt, ...draft }
out.run_date = runDate
out.generated_at = generatedAt

// Once gecici klasorde (dogru dosya adiyla) dogrula; yalnizca gecerse data/daily-bias'a koy.
// Boylece hatali bir taslak, ayni dakikada yazilmis gecerli bir dosyayi ezip silemez.
const name = `${runDate}T${runHHMM}.json`
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-bias-'))
const tmp = path.join(tmpDir, name)
fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n')

const check = spawnSync(process.execPath, [path.join(ROOT, 'ingest', 'ingest.mjs'), '--dry-run', tmp], { stdio: 'inherit' })
if (check.status !== 0) {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  console.error('Dogrulama basarisiz; hicbir dosya yazilmadi. Taslagi duzeltip tekrar calistir.')
  process.exit(1)
}
const file = path.join(ROOT, 'data', 'daily-bias', name)
fs.copyFileSync(tmp, file)
fs.rmSync(tmpDir, { recursive: true, force: true })
console.log(path.relative(ROOT, file))
