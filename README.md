# bias-data

Bu branch `main`'den bağımsızdır (orphan). Railway deploy'unu tetiklemez.

**BTC Daily Bias** Claude routine'i (claude.ai/code/routines) her çalışmada çıktısını
`data/daily-bias/YYYY-MM-DDTHHMM.json` (İstanbul saati) olarak buraya commit'ler. Push gelince
`.github/workflows/daily-bias-ingest.yml` çalışır ve `ingest/ingest.mjs`
tüm dosyaları doğrulayıp Railway Postgres'teki `btc_daily_bias` tablosuna UPSERT eder.
Her çalışma ayrı satırdır (anahtar: `source_file`); günün son çalışması için `btc_daily_bias_latest_per_day` view'ı var.

- Tablo şeması: `ingest/schema.sql` (`main`'deki `db/004` + `db/005` ile aynı). Action her çalışmada idempotent olarak uygular.
- Dosya formatı: `ingest/example.json`
- Gerekli secret: `DATABASE_URL` → Railway Postgres'in **public** bağlantı adresi (`DATABASE_PUBLIC_URL`, `*.proxy.rlwy.net`). İç adres (`postgres.railway.internal`) GitHub'dan erişilemez.
- SSL gerekirse: repo variable `PGSSL=true` ya da URL'e `?sslmode=require`.
- Elle doğrulama: `node ingest/ingest.mjs --dry-run`
- Elle yeniden yükleme: Actions → "BTC Daily Bias -> Postgres" → Run workflow.
