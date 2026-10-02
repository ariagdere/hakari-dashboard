-- btc_daily_bias: gunde birden fazla calisma. Her calisma ayri satir; benzersiz anahtar source_file.
-- Ingest Action (bias-data branch) bunu her calismada idempotent olarak kendisi uygular.

ALTER TABLE btc_daily_bias DROP CONSTRAINT IF EXISTS btc_daily_bias_run_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS btc_daily_bias_source_file_key ON btc_daily_bias (source_file);
CREATE INDEX IF NOT EXISTS idx_btc_daily_bias_run_date ON btc_daily_bias (run_date);

-- Her gunun en son calismasi
CREATE OR REPLACE VIEW btc_daily_bias_latest_per_day AS
SELECT DISTINCT ON (run_date) *
FROM btc_daily_bias
ORDER BY run_date, generated_at DESC;
