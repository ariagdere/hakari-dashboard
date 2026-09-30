// order_intents yardimcilari -- emir route'u ve durum route'u ortak kullanir.
// Tabloya sadece dashboard yazar; mt5_order_monitor.js yalnizca okur (strateji etiketi icin).
import pool from '@/lib/db'

export type IntentStatus = 'SUBMITTING' | 'FILLED' | 'REJECTED' | 'UNKNOWN'

// Emir route'u en fazla ~50 sn surer; bundan uzun SUBMITTING kalan kayit yarim kalmistir.
export const SUBMITTING_STALE_SECONDS = 90
// Sonucu belirsiz (SUBMITTING / UNKNOWN) bir emir varken bu sure boyunca yeni emir, kullanici
// o emri MT5'te kontrol ettigini onaylamadan gonderilmez (sayfa yenileme / panel kapatma /
// ikinci sekme ile ayni pozisyonun iki kez acilmasina karsi).
export const UNRESOLVED_WINDOW_MINUTES = 15

export function intentView(row: any) {
  if (!row) return null
  return {
    status: row.status as IntentStatus,
    clientId: row.client_id as string,
    direction: row.direction as 'LONG' | 'SHORT',
    strategyLabel: row.strategy_label as string,
    volume: Number(row.volume),
    sl: Number(row.sl),
    tp: Number(row.tp),
    positionId: (row.mt5_position_id as string | null) ?? null,
    orderId: (row.mt5_order_id as string | null) ?? null,
    fillPrice: row.fill_price != null ? Number(row.fill_price) : null,
    tradeCode: (row.trade_code as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }
}

export async function getIntentByKey(clientKey: string): Promise<any | null> {
  const { rows } = await pool.query('SELECT * FROM order_intents WHERE client_key = $1', [clientKey])
  return rows[0] ?? null
}

// Emir gonderildikten SONRAKI DB yazimlari: hata olsa bile emir sonucu kullaniciya dogru donmeli.
export async function updateIntentSafe(sql: string, params: unknown[]): Promise<void> {
  try {
    await pool.query(sql, params)
  } catch (err: any) {
    console.error('[order_intents] guncellenemedi:', err?.message ?? err)
  }
}
