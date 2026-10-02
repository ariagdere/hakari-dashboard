-- BTC Daily Bias: her sabah 09:00 (Istanbul) calisan Claude scheduled task'inin makro bias ciktisi.
--
-- Akis: Claude task -> bias-data branch'ine data/daily-bias/YYYY-MM-DD.json commit'ler
--       -> GitHub Action (.github/workflows/daily-bias-ingest.yml, bias-data branch'inde)
--       -> bu tabloya UPSERT. Tabloya SADECE o Action yazar (tek yazma noktasi).
--
-- Calistirma: Action bu DDL'i her calismada IF NOT EXISTS ile kendisi uygular;
-- elle calistirmak gerekmez ama DBeaver'da calistirmak da zararsizdir.

CREATE TABLE IF NOT EXISTS btc_daily_bias (
  id                  serial        PRIMARY KEY,
  run_date            date          NOT NULL UNIQUE,      -- Istanbul tarihi; ayni gun tekrar calisirsa uzerine yazar
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
