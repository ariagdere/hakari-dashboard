# Hakari Dashboard

BTC/USDT MTF analiz sonuçlarını listeleyen, detay ve simülasyon görüntüleyen Next.js dashboard.

## Deploy (Railway)

1. Bu repoyu Railway'e bağla
2. Environment Variables'a ekle:
   ```
   DATABASE_URL=postgresql://postgres:...@gondola.proxy.rlwy.net:33006/railway
   ```
3. Deploy otomatik başlar

## Local Geliştirme

```bash
cp .env.example .env.local
# .env.local içine DATABASE_URL'i yaz

npm install
npm run dev
```

http://localhost:3000 adresinde açılır.
