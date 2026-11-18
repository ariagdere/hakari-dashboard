import { Pool } from 'pg'

// Paralel sistemin (Hakari 2) veritabani: /live grafigindeki elle zonlar ve 3m mumlar buradan okunur.
// - PARALEL_DATABASE_URL: paralel projedeki Postgres'in DATABASE_PUBLIC_URL'i. Tanimli degilse null doner:
//   zonlar cizilmez, 3m dilimi "tanimli degil" der. Diger her sey eskisi gibi calisir.
// - Salt okunur oturum (default_transaction_read_only): bu uygulama paralele hicbir sey yazmaz.
// - Kisa zaman asimlari: paralel DB'ye ulasilamazsa /live beklemez, yalniz zonlar ve 3m eksik kalir.
// Gelistirmede sicak yeniden yuklemede havuz cogalmasin diye globalThis'te tutulur.

const g = globalThis as unknown as { __paralelPool?: Pool }

export function paralelDb(): Pool | null {
  const url = process.env.PARALEL_DATABASE_URL
  if (!url) return null
  if (!g.__paralelPool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
    const pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 60_000,
      statement_timeout: 8_000,
      options: '-c default_transaction_read_only=on',
    })
    pool.on('error', (err) => console.error('[paralel-db] havuz hatasi:', err.message))
    g.__paralelPool = pool
  }
  return g.__paralelPool
}
