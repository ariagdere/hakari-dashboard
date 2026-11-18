// /live "STRATEGY RULES": canli stratejilerin kural setleri, sabit metin; sayfa acilisinda kapali.
// Kurallar degisirse burasi da guncellenmeli:
//   NAIF + ZLEMA: hakari-trigger-orchestrator (src/index.ts, src/naifWindow.ts) ve Make'in naif senaryosu.
//   SDL_v3 - Manuel Zone No Cap: paraleltrading apps/core/src/sdl (engine.ts, sizing.ts, config.ts) ve docs/sdl.md.

// [anahtar, metin] ya da duz metin
type Rule = string | [string, string]
type RuleGroup = { title: string; rules: Rule[] }
type StrategyRuleSet = { label: string; magic: number; summary: string; groups: RuleGroup[]; source: string }

const STRATEGIES: StrategyRuleSet[] = [
  {
    label: 'NAIF + ZLEMA',
    magic: 7575,
    summary: "CoinGlass likidasyon cluster'ları ve ZLEMA 4h bölgesi aynı yönü gösterince Make üzerinden market emri. Risk 10 $.",
    groups: [
      {
        title: 'DÖNGÜ',
        rules: [
          ['Tetik', "Make zamanlayıcısı orchestrator'a /start gönderir, günde 9 kez (İstanbul 07, 09, 10, 11, 13, 15, 17, 19, 21)."],
          'Önceki döngü bitmediyse /start reddedilir, o saat atlanır.',
          ['Heatmap', "Apify'dan CoinGlass likidasyon heatmap'i (BTC, model1, 12h). Başarısız ya da boşsa 3 sn arayla 5 deneme, sonra 5 dk bekleyip yeniden."],
        ],
      },
      {
        title: 'CLUSTER',
        rules: [
          ['Referans fiyat', "heatmap'in son mum kapanışı."],
          "Her fiyat seviyesinin likidasyonu heatmap'in bütün sütunlarından toplanır; 1M $'ın altındaki seviyeler atılır.",
          'Referansın üstünde ve altında ayrı ayrı en büyük seviye seçilir; ±300 $ içindeki seviyeler ona katılır. Cluster fiyatı USD ağırlıklı ortalama.',
          'Üstte ya da altta cluster yoksa işlem yok.',
        ],
      },
      {
        title: 'SETUP',
        rules: [
          ['Yön', "yakın cluster'a doğru (üst yakınsa LONG, alt yakınsa SHORT; eşitse SHORT)."],
          ['TP', "referanstan yakın cluster'a mesafenin %75'i."],
          ['SL', "ters yönde, uzak cluster'a mesafenin %75'i."],
          ['RR', 'yakın mesafe / uzak mesafe; hep 1 ya da altı.'],
          'TP ve SL CoinGlass fiyatıyla; Axi fiyatına göre kaydırılmaz (Axi 20–100 $ farklı olabilir).',
        ],
      },
      {
        title: 'ZLEMA 4H',
        rules: [
          'Binance vadeli BTCUSDT 4h, son 150 mum, oluşan mum dahil.',
          'hlc3 → Kalman filtresi → ZLEMA 8 ve ZLEMA 21.',
          ['LONG', "ZLEMA 8, 21'in üstünde ve son 2 mumdur yükseliyor."],
          ['SHORT', "ZLEMA 8, 21'in altında ve son 2 mumdur düşüyor. İkisi de değilse NO_TRADE."],
          'Emir yalnız setup yönü bölgeyle aynıysa.',
        ],
      },
      {
        title: 'PENCERE',
        rules: [
          'Döngü pazartesi 00:00 – cuma 15:05 (İstanbul) arasında başladıysa; hafta sonu yok.',
          "Karar /start anına göre verilir, heatmap'in geldiği ana göre değil.",
        ],
      },
      {
        title: 'EMİR',
        rules: [
          "Make'in naif webhook'u → MetaApi'den market emri, magic 7575; SL ve TP emirle birlikte.",
          ['Giriş', "emir anındaki Axi fiyatı, heatmap'in son sütunundan ~45 sn sonra (medyan)."],
          ['Lot', "hedef risk 10 $. Orchestrator lotu 20 $ riske göre gönderir (20 $ / SL mesafesi); Make 10 $ riske göre düzenleyip emre koyar."],
          "SL 1.000 $'dan uzaksa 0,01 lotta risk 10 $'ı aşar.",
        ],
      },
      {
        title: 'ÇIKIŞ',
        rules: [
          'Yalnız SL ya da TP.',
          ['Yok', 'bias, haber filtresi, işlem sınırı (açık pozisyona bakılmaz), BE, süreye bağlı çıkış.'],
        ],
      },
    ],
    source: 'hakari-trigger-orchestrator (src/index.ts, naifWindow.ts) · Make naif senaryosu',
  },
  {
    label: 'SDL_v3 - Manuel Zone No Cap',
    magic: 15033,
    summary: "Elle çizilen zonlarda, günlük bias yönünde 3m iFVG dönüşü. Paralel core MetaApi'ye market emri gönderir. Risk 10 $.",
    groups: [
      {
        title: 'PENCERE',
        rules: [
          'Hafta içi, 3m kapanışı İstanbul 07:00–20:00 (iki uç dahil).',
          ['Bias', 'o günün karar anına kadar gelen son bias raporu. Yalnız onun yönünde işlem; NEUTRAL ya da rapor yoksa işlem yok.'],
          ['Haber', 'kırmızı klasör haberinden 1 saat önce yeni işlem açılmaz, 30 dk sonra yeniden açılır.'],
        ],
      },
      {
        title: 'KURULUM',
        rules: [
          "3m mumlar Axi 1m bid mumlarından; /live'daki 3m grafiğiyle aynı.",
          ['FVG (short)', 'boğa FVG, boşluk (3. mumun dibi − 1. mumun tepesi) en az 50 $; aynı gün, dönüşten en çok 80 mum (4 saat) önce oluşmuş.'],
          ['Dönüş', "FVG'nin altında kapanan ilk 3m mumu; giriş bu kapanışta. Aynı mumda birden çok FVG dönerse en son oluşan."],
          ['İğne', "FVG'nin 1. mumundan dönüş mumuna en yüksek fitil."],
          ['Long', "aynası (ayı FVG, FVG'nin üstünde ilk kapanış, en düşük fitil)."],
        ],
      },
      {
        title: 'ZON',
        rules: [
          "Zonlar elle çizilir; Piyasa ve /live grafiğinden eklenir, düzenlenir. core dakikada bir okur.",
          ['Giriş zonu', "iğnenin ulaştığı (alt kenar ≤ iğne) ve dönüş kapanışının üst kenarın altında kaldığı en üstteki zon; iğne zonu aşabilir. Long'da aynası. Yoksa işlem yok."],
          ['Dönüşüm şartı', "giriş zonunun girişten önceki son kırılması işlem yönünde olmalı: short'ta aşağı, long'da yukarı. Hiç kırılmamış zon geçmez."],
          ['Kırılma', 'bir 4h kapanışının bandın 0,15 × ATR(14, Wilder) ötesine geçmesi; zonun kırılma takibi başlangıcından (zon eklenirken seçilen gün) sayılır.'],
        ],
      },
      {
        title: 'GİRİŞ · SL · TP',
        rules: [
          ['Giriş', 'dönüş kapanışında market emri; short bid, long ask.'],
          ['SL', "iğne + 15 $ (long'da iğne − 15 $)."],
          ['TP', "girişin tamamen ötesindeki ilk zonun yakın kenarından 15 $ önce (short'ta alttaki zonun üst kenarı + 15 $). Ötede zon yoksa işlem yok."],
        ],
      },
      {
        title: 'LOT',
        rules: [
          ['Risk', 'hedef 10 $; lot adımına aşağı yuvarlanır. Risk = |giriş − SL| × lot.'],
          "Lot 0,01'in altına düşerse 0,01 ile girilir; o lotta risk 20 $'ı aşıyorsa işlem yok.",
          'Lot üst sınırı 0,2.',
        ],
      },
      {
        title: 'EMİR',
        rules: [
          "Karar her 3m kapanışından ~1–2 sn sonra; MetaApi'ye market emri, magic 15033, SL ve TP emirle birlikte.",
          'Kapanıştan 60 sn geçtiyse emir gönderilmez.',
          'Sonucu belirsiz emir tekrar gönderilmez; belirsiz emir varken 15 dk yeni emir açılmaz.',
          ['İki anahtar', "Railway'de SDL_TRADING_ENABLED (kapalıysa gölge mod: karar yazılır, emir gitmez) ve paralel SDL sayfasındaki NO TRADE düğmesi."],
        ],
      },
      {
        title: 'ÇIKIŞ',
        rules: [
          "Yalnız SL ya da TP. Zon sonradan değişse de açık pozisyonun SL/TP'si değişmez.",
          ['Yok', 'işlem sınırı (No Cap), 3 kayıp kuralı, BE, süreye bağlı çıkış.'],
        ],
      },
    ],
    source: 'paraleltrading apps/core/src/sdl · docs/sdl.md',
  },
]

const CSS = `
.sr { margin-bottom: 24px; }
.sr > .sr-summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 0; cursor: pointer; list-style: none; user-select: none; }
.sr > .sr-summary::-webkit-details-marker { display: none; }
.sr > .sr-summary:hover, .sr > .sr-summary:hover .sr-hint { color: var(--text); }
.sr > .sr-summary:focus-visible { outline: 1px solid var(--border-3); outline-offset: 3px; }
.sr[open] > .sr-summary { margin-bottom: 12px; }
.sr-hint { display: inline-flex; align-items: center; gap: 8px; color: var(--text-3); letter-spacing: 0.04em; }
.sr-chev { display: inline-block; transition: transform 0.15s; }
.sr[open] .sr-chev { transform: rotate(90deg); }
.sr-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.sr-card { padding: 16px; min-width: 0; }
.sr-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px 12px; flex-wrap: wrap; }
.sr-name { font-size: 15px; font-weight: 600; color: var(--text); letter-spacing: 0.01em; }
.sr-magic { font-size: 11px; color: var(--text-3); border: 1px solid var(--border); border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
.sr-lead { margin-top: 6px; margin-bottom: 4px; font-size: 13px; line-height: 1.5; color: var(--text-3); }
.sr-group { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 6px 16px; padding: 10px 0; border-top: 1px solid var(--border); }
.sr-group:first-child { margin-top: 8px; }
.sr-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em; color: var(--text-3); padding-top: 3px; }
.sr-list { list-style: none; display: grid; gap: 5px; }
.sr-list li { position: relative; padding-left: 12px; font-size: 13px; line-height: 1.5; color: var(--text-2); overflow-wrap: anywhere; }
.sr-list li::before { content: ''; position: absolute; left: 0; top: 0.62em; width: 4px; height: 4px; border-radius: 50%; background: var(--border-3); }
.sr-key { color: var(--text-3); }
.sr-source { margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 10px; color: var(--text-3); }
@media (max-width: 1100px) {
  .sr-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 600px) {
  .sr-group { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .sr-label { padding-top: 0; }
}
`

function RuleText({ rule }: { rule: Rule }) {
  if (typeof rule === 'string') return <>{rule}</>
  return (
    <>
      <span className="sr-key">{rule[0]}:</span> {rule[1]}
    </>
  )
}

export default function StrategyRules() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <details className="sr">
        <summary className="live-section-title sr-summary">
          <span>STRATEGY RULES</span>
          <span className="sr-hint">
            {STRATEGIES.length} strateji
            <span className="sr-chev" aria-hidden="true">▸</span>
          </span>
        </summary>
        <div className="sr-grid">
          {STRATEGIES.map((s) => (
            <section key={s.magic} className="card sr-card" aria-label={s.label}>
              <div className="sr-head">
                <h3 className="sr-name">{s.label}</h3>
                <span className="sr-magic">magic {s.magic}</span>
              </div>
              <p className="sr-lead">{s.summary}</p>
              <dl>
                {s.groups.map((g) => (
                  <div key={g.title} className="sr-group">
                    <dt className="sr-label">{g.title}</dt>
                    <dd>
                      <ul className="sr-list">
                        {g.rules.map((r, i) => (
                          <li key={i}>
                            <RuleText rule={r} />
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="sr-source mono">Kaynak: {s.source}</div>
            </section>
          ))}
        </div>
      </details>
    </>
  )
}
