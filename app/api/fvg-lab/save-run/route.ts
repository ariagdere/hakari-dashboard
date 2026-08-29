import { NextResponse, NextRequest } from 'next/server'
import pool from '@/lib/db'
import { SimTrade } from '@/lib/fvgBacktest'

export const dynamic = 'force-dynamic'

// Kullanicinin ONCEDEN hesaplattigi (simulate cikisi) sonucu OLDUGU GIBI
// kaydeder -- YENIDEN HESAPLAMA YAPMAZ. "Gordugun sonuc kaydedilir" ilkesi.
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const body = await req.json()
    const { label, params, dateRangeStart, dateRangeEnd, metrics, equityCurve, trades } = body as {
      label?: string
      params: any
      dateRangeStart: string
      dateRangeEnd: string
      metrics: { totalTrades: number; winRate: number; totalR: number; maxDD: number }
      equityCurve: any
      trades: SimTrade[]
    }

    if (!params || !dateRangeStart || !dateRangeEnd || !metrics || !trades) {
      return NextResponse.json({ error: 'Eksik alan(lar): params, dateRangeStart, dateRangeEnd, metrics, trades zorunlu' }, { status: 400 })
    }

    await client.query('BEGIN')

    const runResult = await client.query(
      `INSERT INTO fvg_sim_runs
         (label, params_json, date_range_start, date_range_end, total_trades, win_rate, total_r, max_dd, equity_curve_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [label || null, JSON.stringify(params), dateRangeStart, dateRangeEnd,
       metrics.totalTrades, metrics.winRate, metrics.totalR, metrics.maxDD, JSON.stringify(equityCurve)]
    )
    const runId = runResult.rows[0].id

    if (trades.length > 0) {
      // Toplu (multi-row) INSERT -- binlerce trade icin tek tek execute
      // etmek yerine, tek SQL ifadesinde COK satirlik VALUES olusturur.
      // ONEMLI: closedAt NULL olsa bile HER SATIR icin SABIT 15 parametre
      // kullanilir (SQL'de kosullu placeholder atlama YAPILMAZ) -- aksi
      // halde bir EXPIRED trade'den sonraki TUM trade'lerin $N numaralari
      // parametre dizisiyle kayar. to_timestamp(NULL) PostgreSQL'de guvenle
      // NULL doner, bu yuzden closedAt=null oldugunda dogrudan null parametre
      // gecmek yeterli ve guvenlidir.
      const COLS = 15
      const BATCH_SIZE = 500

      for (let batchStart = 0; batchStart < trades.length; batchStart += BATCH_SIZE) {
        const batch = trades.slice(batchStart, batchStart + BATCH_SIZE)
        const valuesSql: string[] = []
        const batchParams: any[] = []

        batch.forEach((t, i) => {
          const b = i * COLS
          valuesSql.push(
            `($${b + 1}, $${b + 2}, $${b + 3}, to_timestamp($${b + 4}::numeric/1000.0), to_timestamp($${b + 5}::numeric/1000.0), ` +
            `$${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, ` +
            `to_timestamp($${b + 15}::numeric/1000.0))`
          )
          batchParams.push(
            runId, t.fvgType, t.direction, t.formedAt, t.filledAt,
            t.sweepPass, t.bosPass, t.displacementPass,
            t.entry, t.sl, t.tp, t.rr, t.result, t.rMultiple,
            t.closedAt // null olabilir -- to_timestamp(NULL) guvenle NULL doner
          )
        })

        await client.query(
          `INSERT INTO fvg_sim_trades
             (run_id, fvg_type, direction, formed_at, filled_at,
              sweep_pass, bos_pass, displacement_pass,
              entry, sl, tp, rr, result, r_multiple, closed_at)
           VALUES ${valuesSql.join(', ')}`,
          batchParams
        )
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ success: true, runId })
  } catch (err: any) {
    await client.query('ROLLBACK')
    console.error('save-run error:', err?.message || err)
    return NextResponse.json({ error: 'Kaydetme hatası', detail: String(err?.message || err) }, { status: 500 })
  } finally {
    client.release()
  }
}
