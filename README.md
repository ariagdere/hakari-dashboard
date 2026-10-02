# bias-data

Bu branch `main`'den bağımsızdır (orphan). Railway deploy'unu tetiklemez.

Her sabah 09:00 (İstanbul) çalışan **BTC Daily Bias** scheduled task'i çıktısını
`data/daily-bias/YYYY-MM-DD.json` olarak buraya commit'ler. Push gelince
`.github/workflows/daily-bias-ingest.yml` çalışır ve `ingest/ingest.mjs`
tüm dosyaları doğrulayıp Railway Postgres'teki `btc_daily_bias` tablosuna UPSERT eder.

- Tablo şeması: `ingest/schema.sql` (`main`'deki `db/004_btc_daily_bias.sql` ile aynı). Action her çalışmada `IF NOT EXISTS` ile uygular.
- Dosya formatı: `ingest/example.json`
- Gerekli secret: `DATABASE_URL` → Railway Postgres'in **public** bağlantı adresi (`DATABASE_PUBLIC_URL`, `*.proxy.rlwy.net`). İç adres (`postgres.railway.internal`) GitHub'dan erişilemez.
- SSL gerekirse: repo variable `PGSSL=true` ya da URL'e `?sslmode=require`.
- Elle doğrulama: `node ingest/ingest.mjs --dry-run`
- Elle yeniden yükleme: Actions → "BTC Daily Bias -> Postgres" → Run workflow.
