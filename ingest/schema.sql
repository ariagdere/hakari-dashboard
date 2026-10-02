-- BTC Daily Bias: Claude routine'inin makro bias ciktisi. Gunde birden fazla calisabilir;
-- HER CALISMA AYRI SATIR. Benzersiz anahtar source_file (dosya yolu); ayni dosya tekrar
-- push edilirse satir guncellenir, yeni dosya yeni satir olur.
--
-- Akis: Claude routine -> bias-data branch'ine data/daily-bias/YYYY-MM-DDTHHMM.json commit'ler
--       (eski tek-gunluk format YYYY-MM-DD.json da gecerli)
--       -> GitHub Action (.github/workflows/daily-bias-ingest.yml, bias-data branch'inde)
--       -> bu tabloya UPSERT. Tabloya SADECE o Action yazar (tek yazma noktasi).
--
-- Calistirma: Action bu DDL'i her calismada IF NOT EXISTS ile kendisi uygular;
-- elle calistirmak gerekmez ama DBeaver'da calistirmak da zararsizdir.

CREATE TABLE IF NOT EXISTS btc_daily_bias (
  id                  serial        PRIMARY KEY,
  run_date            date          NOT NULL,             -- Istanbul tarihi (gun bazli gruplama icin; unique degil)
  generated_at        timestamptz   NOT NULL,             -- task'in analizi urettigi an
  net_direction       varchar(20)   NOT NULL,             -- 'Guclu Pozitif' ... 'Guclu Negatif' (task'in Turkce etiketi)
  net_direction_level smallint      NOT NULL CHECK (net_direction_level BETWEEN -3 AND 3),
  sentiment_score     smallint      NOT NULL CHECK (sentiment_score BETWEEN -100 AND 100),
  change_24h          varchar(12)   NOT NULL CHECK (change_24h IN ('IMPROVED', 'UNCHANGED', 'WORSENED')),
  drivers             jsonb         NOT NULL,             -- ["...", ...] en fazla 4
  developments        jsonb,                              -- [{"item": "...", "impact": "POSITIVE|NEUTRAL|NEGATIVE"}]
  key_development     text,
  divergence          varchar(20)   NOT NULL CHECK (divergence IN ('RELATIVE_STRENGTH', 'RELATIVE_WEAKNESS', 'ALIGNED')),
  divergence_note     text,
  liquidity_regime    varchar(20)   NOT NULL CHECK (liquidity_regime IN ('TIGHTENING', 'NEUTRAL', 'EASING', 'STRONG_EXPANSION')),
  risk_regime         varchar(20)   NOT NULL CHECK (risk_regime IN ('RISK_ON', 'CAUTIOUS_RISK_ON', 'NEUTRAL', 'CAUTIOUS_RISK_OFF', 'RISK_OFF')),
  conclusion          text,
  bias                varchar(7)    NOT NULL CHECK (bias IN ('LONG', 'NEUTRAL', 'SHORT')),
  confidence          varchar(6)    NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  raw_text            text          NOT NULL,             -- task'in tam metin ciktisi
  model               text,
  prompt_version      text,
  source_file         text          NOT NULL,             -- bias-data branch'indeki dosya yolu
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_btc_daily_bias_generated_at ON btc_daily_bias (generated_at DESC);

-- v1 -> v2 gecisi (idempotent): gunde tek satir kisitini kaldir, dosya basina tek satir yap.
ALTER TABLE btc_daily_bias DROP CONSTRAINT IF EXISTS btc_daily_bias_run_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS btc_daily_bias_source_file_key ON btc_daily_bias (source_file);
CREATE INDEX IF NOT EXISTS idx_btc_daily_bias_run_date ON btc_daily_bias (run_date);

-- Her gunun en son calismasi (gunluk tek deger isteyen sorgular icin).
CREATE OR REPLACE VIEW btc_daily_bias_latest_per_day AS
SELECT DISTINCT ON (run_date) *
FROM btc_daily_bias
ORDER BY run_date, generated_at DESC;
