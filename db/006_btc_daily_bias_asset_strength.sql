-- btc_daily_bias: varlik guc siralamasi (routine prompt v4+).
-- [{"rank":1,"asset":"BTC","score":7.5,"reason":"...","chg_24h_pct":1.2,"chg_7d_pct":4.8}, ...]
-- asset: BTC | DXY | XAUUSD | VIX | NASDAQ | SPX | BRENT; puana gore sirali (siralamayi ingest yapar).
-- Eski calismalarda NULL. Ingest Action (bias-data branch) bunu her calismada idempotent olarak kendisi uygular.

ALTER TABLE btc_daily_bias ADD COLUMN IF NOT EXISTS asset_strength jsonb;

-- Yeni kolonun view'a da girmesi icin (SELECT * olusturma aninda acilir):
CREATE OR REPLACE VIEW btc_daily_bias_latest_per_day AS
SELECT DISTINCT ON (run_date) *
FROM btc_daily_bias
ORDER BY run_date, generated_at DESC;

-- Ornek: uzun formatta okuma
-- SELECT b.generated_at, s.*
-- FROM btc_daily_bias b,
--      jsonb_to_recordset(b.asset_strength) AS s(rank int, asset text, score numeric, reason text,
--                                                 chg_24h_pct numeric, chg_7d_pct numeric)
-- ORDER BY b.generated_at DESC, s.rank;
