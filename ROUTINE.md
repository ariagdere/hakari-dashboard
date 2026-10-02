# BTC Daily Bias — routine talimatları (v4)

Bu dosya BTC Daily Bias routine'inin tek talimat kaynağıdır. Routine'in kendi prompt'u yalnızca
bu dosyayı okuyup uygulamasını söyler; talimat değişiklikleri buraya commit'lenir.
Aşağıda "bias-data" bu dosyanın bulunduğu klasör (bias-data branch'inin çalışma kopyası) demektir.

## 1. Analiz

Her çalıştırıldığında güncel web verilerini kullanarak, özellikle son 24 saati, ikinci ağırlık olarak son 7 günü analiz et.

Amaç: Küresel makroekonomik ortamın Bitcoin (BTC) üzerindeki kısa vadeli yönsel etkisini belirlemek.

Şu başlıkları birlikte değerlendir:

* Asya londra ve US borsa seanslarının durumu
* Fed faiz beklentileri, faiz artırımı/indirimi olasılıkları ve bilanço/QE beklentileri
* ABD 2Y ve 10Y tahvil faizlerinin yönü
* Reel faizler
* DXY / dolar sentimenti
* Global likidite ve merkez bankalarının gevşeme/sıkılaşma eğilimi
* ABD büyüme, istihdam ve enflasyon verileri
* Petrol fiyatları ve enerji kaynaklı enflasyon riski
* Jeopolitik risk
* VIX ve genel risk iştahı
* Nasdaq / teknoloji hisselerindeki sentiment
* Altın ve güvenli liman talebi
* Çin, Japonya, ECB ve BOJ kaynaklı önemli para politikası değişimleri
* BTC ve ETH spot ETF giriş/çıkışları
* Stablecoin arzı / kripto likiditesi
* BTC’nin makro gelişmelere verdiği tepkinin gücü veya zayıflığı

Haberleri eşit ağırlıklandırma. Özellikle:

1. Son 6 saatte oluşan yeni gelişmelere,
2. Son 24 saatte sentiment değiştiren gelişmelere,
3. Piyasanın henüz tam fiyatlamamış olabileceği gelişmelere
    daha fazla ağırlık ver.

Eski veya zaten fiyatlanmış haberlerin ağırlığını azalt.

Her gelişmeyi BTC açısından şu üç kategoriden biriyle sınıflandır:
Pozitif / Nötr / Negatif

Ardından şu soruyu cevapla:

“Şu anda makro koşullar BTC almak için talebi artırıyor mu, azaltıyor mu?”

Çıktıyı kısa tut ve şu formatta ver:

BTC Makro Sentiment

Net yön: Güçlü Pozitif / Pozitif / Hafif Pozitif / Nötr / Hafif Negatif / Negatif / Güçlü Negatif

Sentiment skoru: -100 ile +100 arasında

Son 24 saatte değişim: Önceki güne göre iyileşti / değişmedi / kötüleşti

Ana sürücüler:
En fazla 4 maddeyle, BTC yönünü şu anda gerçekten etkileyen unsurları yaz.

En önemli yeni gelişme:
Son birkaç saatte ortaya çıkan ve BTC yönünü değiştirme potansiyeli en yüksek gelişmeyi tek paragrafta açıkla.

Makro uyumsuzluk kontrolü:
BTC fiyatının makro ortamla uyumlu hareket edip etmediğini değerlendir.
Örneğin dolar ve faizler düşerken BTC yükselmiyorsa bunu “relative weakness” olarak işaretle.
Makro kötüleşirken BTC güçlü kalıyorsa bunu “relative strength” olarak işaretle.

Likidite rejimi:
Sıkılaşıyor / Nötr / Gevşiyor / Güçlü şekilde genişliyor

Risk rejimi:
Risk-on / Temkinli risk-on / Nötr / Temkinli risk-off / Risk-off

BTC için sonuç:
En fazla 3 cümlede önümüzdeki 24–72 saat için makro bazlı yön beklentisini yaz.

Varlık güç sıralaması:
BTC, DXY (dolar endeksi), XAUUSD (altın), VIX, Nasdaq, S&P 500 ve Brent petrolün son 24 saatteki (ikinci ağırlıkla son 7 gündeki) fiyat gücünü ve eğilimini 10 üzerinden puanlayıp güçlüden zayıfa sırala, her birine tek cümlelik gerekçe yaz (VIX'te yüksek puan korkunun arttığını gösterir).
- Ölçek: 0 = çok zayıf / sert düşüş, 5 = yatay, 10 = çok güçlü / sert yükseliş. Yarım puan kullanabilirsin.
- Nasdaq için Nasdaq 100 (NDX), S&P 500 için SPX, Brent için vadeli Brent fiyatını kullan. Piyasası kapalı olan varlıkta son 24 saat yerine son işlem seansını esas al.
- Her varlığın 24 saatlik ve 7 günlük yüzde değişimini bul; puanı bu değişimlere ve eğilimin istikrarına dayandır.
- Bu bölüm, bu talimatlardaki "Fiyat teknik analizi yapma" kuralının istisnasıdır: grafik formasyonu ya da indikatör yorumu yapma, yalnızca fiyat değişimine ve eğilime bak. BTC Makro Bias kararını bu sıralama değil, makro değerlendirme belirler.
Her satır şu formatta, güçlüden zayıfa:
1. <Varlık> — <puan>/10 — <tek cümle gerekçe> (24s: <±%>, 7g: <±%>)

Son satırda mutlaka şunu ver:

BTC Makro Bias: LONG / NEUTRAL / SHORT
ve yanında güven seviyesini:
Düşük / Orta / Yüksek

Fiyat teknik analizi yapma. Yalnızca makro, likidite, risk sentimenti ve kurumsal/ETF akımları üzerinden karar ver.

## 2. Sonucu veritabanına gönder (zorunlu)

Yukarıdaki metin çıktısını ürettikten sonra aynı sonucu GitHub üzerinden Postgres'e gönder. Bu adım analizin bir
parçasıdır, atlama. Görev gün içinde birden fazla kez çalışabilir; her çalışma kendi dosyasını yazar, öncekilerin
üzerine yazmaz.

1. "Son 24 saatte değişim" için önceki günün son çalışmasıyla karşılaştır: bias-data/data/daily-bias/ altındaki
   önceki günün (ya da en son önceki günün) en geç saatli JSON dosyasına bak.

2. İstanbul (UTC+3) saatine göre: RUN_DATE = YYYY-MM-DD, RUN_HHMM = şu anki saat ve dakika (örn. 0907).
   Hesapla: `TZ=Europe/Istanbul date +%Y-%m-%d` ve `TZ=Europe/Istanbul date +%H%M`.

3. Dosya: bias-data/data/daily-bias/<RUN_DATE>T<RUN_HHMM>.json (örn. 2026-10-03T0907.json).
   Format bias-data/ingest/example.json ile birebir aynı olmalı:

   ```
   {
     "run_date": "<RUN_DATE>",
     "generated_at": "<şu an, ISO 8601 UTC, örn. 2026-10-03T06:11:40Z>",
     "net_direction": "Güçlü Pozitif | Pozitif | Hafif Pozitif | Nötr | Hafif Negatif | Negatif | Güçlü Negatif",
     "sentiment_score": <-100..100 tam sayı>,
     "change_24h": "iyileşti | değişmedi | kötüleşti",
     "drivers": ["...", "..."],
     "developments": [{"item": "...", "impact": "Pozitif | Nötr | Negatif"}],
     "key_development": "...",
     "divergence": "relative strength | relative weakness | aligned",
     "divergence_note": "...",
     "liquidity_regime": "Sıkılaşıyor | Nötr | Gevşiyor | Güçlü şekilde genişliyor",
     "risk_regime": "Risk-on | Temkinli risk-on | Nötr | Temkinli risk-off | Risk-off",
     "conclusion": "...",
     "bias": "LONG | NEUTRAL | SHORT",
     "confidence": "Düşük | Orta | Yüksek",
     "raw_text": "<yukarıda ürettiğin tam metin çıktısı, birebir>",
     "asset_strength": [
       {"asset": "BTC | DXY | XAUUSD | VIX | NASDAQ | SPX | BRENT", "score": <0..10>, "reason": "<tek cümle>",
        "chg_24h_pct": <yüzde, örn. -1.25; bulunamazsa null>, "chg_7d_pct": <yüzde; bulunamazsa null>}
     ],
     "model": "<senin model kimliğin>",
     "prompt_version": "v4"
   }
   ```

   Alan notları:
   - drivers: 1-4 madde, metindeki Ana sürücüler.
   - developments: sınıflandırdığın tüm önemli gelişmeler.
   - key_development: En önemli yeni gelişme paragrafı. divergence_note: Makro uyumsuzluk kontrolü açıklaması.
     conclusion: BTC için sonuç.
   - asset_strength: 7 varlığın hepsi, her biri tam bir kez, metindeki sırayla (güçlüden zayıfa). Varlık adları
     tam olarak şu kodlar: BTC, DXY, XAUUSD, VIX, NASDAQ, SPX, BRENT. Puanlar ve gerekçeler metindekiyle aynı olmalı.

   Değerler metin çıktısıyla tutarlı olmalı. Geçerli JSON üret (yorum satırı yok).

4. Doğrula: `cd bias-data/ingest && npm install --no-audit --no-fund && cd .. && node ingest/ingest.mjs --dry-run data/daily-bias/<RUN_DATE>T<RUN_HHMM>.json`
   Hata verirse JSON'u düzelt ve tekrar doğrula. Geçmeden commit'leme.

5. Sadece o JSON dosyasını commit'le ve push'la (node_modules gitignore'da):
   ```
   git -C bias-data add data/daily-bias/<RUN_DATE>T<RUN_HHMM>.json
   git -C bias-data -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "daily-bias: <RUN_DATE> <RUN_HHMM> <bias> <confidence>"
   git -C bias-data push origin bias-data
   ```
   Push reddedilirse bir kez: `git -C bias-data pull --rebase origin bias-data` ve tekrar push. 403 gibi yetki
   hatasında tekrar deneme. main branch'ine ve başka hiçbir dosyaya dokunma; claude/ önekli branch açma.

6. Push'tan sonra GitHub Action dosyayı btc_daily_bias tablosuna ayrı bir satır olarak yazar; bunu beklemene gerek yok.

Son mesajında önce metin çıktısını ver, en sona tek satır ekle:
"DB: <RUN_DATE>T<RUN_HHMM>.json bias-data'ya push edildi (commit <kısa sha>)" ya da başarısızsa nedenini ve git'in tam
hata mesajını yaz.
