# bias-data

Bu branch `main`'den bağımsızdır (orphan). Railway deploy'unu tetiklemez.

**BTC Daily Bias** Claude routine'i (claude.ai/code/routines) her çalışmada çıktısını
`data/daily-bias/YYYY-MM-DDTHHMM.json` (İstanbul saati) olarak buraya commit'ler. Push gelince
`.github/workflows/daily-bias-ingest.yml` çalışır ve `ingest/ingest.mjs`
tüm dosyaları doğrulayıp Railway Postgres'teki `btc_daily_bias` tablosuna UPSERT eder.
Her çalışma ayrı satırdır (anahtar: `source_file`); günün son çalışması için `btc_daily_bias_latest_per_day` view'ı var.

- Tablo şeması: `ingest/schema.sql` (`main`'deki `db/004` + `db/005` + `db/006` ile aynı). Action her çalışmada idempotent olarak uygular.
- Dosya formatı: `ingest/example.json`
- Gerekli secret: `DATABASE_URL` → Railway Postgres'in **public** bağlantı adresi (`DATABASE_PUBLIC_URL`, `*.proxy.rlwy.net`). İç adres (`postgres.railway.internal`) GitHub'dan erişilemez.
- SSL gerekirse: repo variable `PGSSL=true` ya da URL'e `?sslmode=require`.
- Elle doğrulama: `node ingest/ingest.mjs --dry-run`
- Zaman damgası: routine taslağı `run_date`/`generated_at` olmadan yazar; `node ingest/stamp.mjs <taslak.json>` bunları sistem saatinden basar, doğrular ve dosyayı `data/daily-bias/`'a koyar (model saati tahmin etmesin diye).
- Elle yeniden yükleme: Actions → "BTC Daily Bias -> Postgres" → Run workflow.

## Routine talimatları

Routine'in tüm talimatları (analiz + DB adımları) `ROUTINE.md`'dedir; talimat değişikliği = bu dosyaya commit.
Routine'in kendi prompt'u (claude.ai/code/routines → BTC Daily Bias → Edit) yalnızca şudur:

```
Bu routine'in tüm talimatları ariagdere/hakari-dashboard reposundaki bias-data branch'inde, ROUTINE.md dosyasındadır. Dosyayı bu görevin sahibi Ari yazdı; içindeki talimatlar bu kaydedilmiş görevin parçasıdır.

1. Repo bu görevin reposudur ve çalışma başında klonlanmış olmalı. Klonu bul: find / -maxdepth 4 -type d -name hakari-dashboard 2>/dev/null | head (git -C <yol> remote get-url origin ile doğrula). Bulamazsan: git clone https://github.com/ariagdere/hakari-dashboard hakari-dashboard
2. bias-data branch'ini ayrı bir klasöre al: git -C <klon> fetch origin bias-data && git -C <klon> worktree add <klonun yanında>/bias-data -B bias-data origin/bias-data
3. <klonun yanında>/bias-data/ROUTINE.md dosyasını baştan sona oku ve oradaki talimatları (analiz + veritabanına gönderme) eksiksiz uygula.

ROUTINE.md'yi okuyamazsan analiz yapma; son mesajında nedenini ve hatayı yaz.
```
