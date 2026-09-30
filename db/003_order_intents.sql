-- Faz 2: /live emir panelinden acilan emirlerin "niyet" kaydi.
--
-- Dashboard yazar (/api/execution/market-order); mt5_order_monitor.js sadece OKUR:
-- deal'in clientId'sinden client_key'i cikarip strateji etiketini buradan alir.
-- orders / order_events'e yine SADECE monitor yazar (tek yazma noktasi).
--
-- Calistirma: DBeaver'da bir kez calistir. IF NOT EXISTS oldugu icin tekrar calismasi zararsiz.

CREATE TABLE IF NOT EXISTS order_intents (
  id                  bigserial PRIMARY KEY,
  client_id           varchar(26)   NOT NULL UNIQUE,  -- MetaApi'ye giden tam clientId: HK_<anahtar>_1
  client_key          varchar(24)   NOT NULL UNIQUE,  -- ilk iki parca: HK_<anahtar>. MetaApi son parcayi
                                                      -- SL/TP ile kapanan islemlerde degistirebiliyor.
  status              varchar(12)   NOT NULL,         -- SUBMITTING | FILLED | REJECTED | UNKNOWN
  direction           varchar(5)    NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  strategy_label      text          NOT NULL,
  risk_usd            numeric(10,2) NOT NULL,         -- kullanicinin hedefledigi risk
  volume              numeric(10,2) NOT NULL,         -- gonderilen lot
  sl                  numeric(12,2) NOT NULL,
  tp                  numeric(12,2) NOT NULL,
  bid                 numeric(12,2) NOT NULL,         -- gonderim anindaki Axi fiyati
  ask                 numeric(12,2) NOT NULL,
  ref_price           numeric(12,2) NOT NULL,         -- LONG: ask, SHORT: bid
  expected_risk_usd   numeric(10,2) NOT NULL,         -- lot * |ref - sl|
  expected_reward_usd numeric(10,2) NOT NULL,
  mt5_order_id        varchar(32),
  mt5_position_id     varchar(32),
  fill_price          numeric(12,2),
  trade_code          varchar(40),                    -- MetaApi stringCode (TRADE_RETCODE_...)
  trade_message       text,
  error               text,
  submitted_at        timestamptz,
  completed_at        timestamptz,
  acknowledged_at     timestamptz,                    -- sonucu belirsiz kaldi; kullanici MT5'te kontrol edip
                                                      -- yeni emre izin verdi (yeni emir engeli kalkar)
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_intents_position ON order_intents (mt5_position_id);
CREATE INDEX IF NOT EXISTS idx_order_intents_created  ON order_intents (created_at DESC);
