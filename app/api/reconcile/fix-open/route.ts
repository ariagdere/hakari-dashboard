import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { parseCommentField, resolveStrategyLabel, calculateRR, fetchDealsByPosition, fetchOpenPositions } from '@/lib/reconcileHelpers';

export const dynamic = 'force-dynamic';

// OPEN_POSITION_MISSING (order hic yok ya da yanlis status'te) VE SL_TP_BLANK
// (order var, OPEN, ama sl/tp bos) icin ORTAK duzeltme: MT5'teki GUNCEL acik
// pozisyon verisiyle senkronize eder. comment/magic, pozisyon objesinde
// GUVENILIR olmayabilecegi icin (MetatraderPosition ornek semasinda comment
// yok) history-deals'taki DEAL_ENTRY_IN'den okunur -- acik bir pozisyon icin
// bu deal HER ZAMAN mevcuttur.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const positionId = body?.positionId as string;
    if (!positionId) return NextResponse.json({ error: 'positionId zorunlu' }, { status: 400 });

    const positions = await fetchOpenPositions();
    const position = positions.find((p) => p.id === positionId);
    if (!position) return NextResponse.json({ error: 'Pozisyon MT5\'te artık açık değil (belki bu arada kapandı)' }, { status: 404 });

    const { rows: existingRows } = await pool.query(`SELECT id, status, sl, tp FROM orders WHERE mt5_position_id = $1`, [positionId]);
    const existing = existingRows[0];
    const sl = position.stopLoss ?? null, tp = position.takeProfit ?? null;

    if (existing) {
      // Order zaten var -- status'u OPEN'a cek (yanlissa) ve sadece BIZDE
      // BOS olan sl/tp'yi doldur (doluysa DOKUNMA -- dropdown'la duzeltilmis olabilir).
      const newSl = existing.sl != null ? existing.sl : sl;
      const newTp = existing.tp != null ? existing.tp : tp;
      await pool.query(
        `UPDATE orders SET status='OPEN', sl=$1, tp=$2, updated_at=now() WHERE id=$3`,
        [newSl, newTp, existing.id]
      );
      return NextResponse.json({ ok: true, orderId: existing.id, action: 'updated' });
    }

    // Order HIC yok -- history-deals'taki giris deal'inden magic/comment/entry al.
    const deals = await fetchDealsByPosition(positionId);
    const inDeal = deals.find((d) => d.entryType === 'DEAL_ENTRY_IN');
    if (!inDeal) return NextResponse.json({ error: 'Açılış deal\'i bulunamadı' }, { status: 404 });

    const entryPrice = Number(inDeal.price ?? position.openPrice ?? 0);
    const volume = Number(inDeal.volume ?? position.volume ?? 0);
    const magic = Number(inDeal.magic ?? position.magic ?? 0);
    const { analysisId, apifyRunId } = parseCommentField(inDeal.comment ?? inDeal.brokerComment);
    const strategyLabel = resolveStrategyLabel(magic);
    const isSystem = analysisId != null || apifyRunId != null || strategyLabel != null;
    const direction = inDeal.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL';

    const { rows } = await pool.query(
      `INSERT INTO orders
         (analysis_id, apify_run_id, mt5_order_id, mt5_position_id, magic, strategy_label, symbol, direction,
          volume, entry_price, fill_price, sl, tp, rr, status, opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'OPEN',$15)
       RETURNING id`,
      [
        isSystem ? analysisId : null,
        isSystem ? apifyRunId : null,
        inDeal.orderId ?? inDeal.id,
        positionId,
        magic,
        isSystem ? (strategyLabel ?? `MAGIC_${magic}`) : 'MANUAL',
        inDeal.symbol ?? position.symbol,
        direction,
        volume,
        entryPrice,
        entryPrice,
        sl, tp,
        calculateRR(entryPrice, sl, tp),
        inDeal.time,
      ]
    );

    // BILEREK: order_events'e HICBIR SEY yazilmiyor.
    return NextResponse.json({ ok: true, orderId: rows[0].id, action: 'created' });
  } catch (err: any) {
    console.error('fix-open error:', err);
    return NextResponse.json({ error: err.message || 'İşlem başarısız' }, { status: 500 });
  }
}
