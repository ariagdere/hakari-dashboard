import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  MetatraderOrder, resolveDealOrigin, calculateRR, calculateRTargetRisk, fetchDealsByPosition, fetchHistoryOrdersByPosition,
  fetchOpenPositions, fillBlankSlTp, mt5OrderTimeMs, positiveOrNull,
} from '@/lib/reconcileHelpers';
import { computeOrderAngles, fillBlankAngles } from '@/lib/orderAngles';

export const dynamic = 'force-dynamic';

// Emrin verildigi an icin history order istegi zorunlu degil: yanit gecikirse beklemeden deal anina dusulur
const HISTORY_ORDERS_TIMEOUT_MS = 5_000;

// OPEN_POSITION_MISSING (order hic yok ya da yanlis status'te) VE SL_TP_BLANK
// (order var, OPEN, ama sl/tp bos) icin ORTAK duzeltme: MT5'teki GUNCEL acik
// pozisyon verisiyle senkronize eder. comment/magic, pozisyon objesinde
// GUVENILIR olmayabilecegi icin (MetatraderPosition ornek semasinda comment
// yok) history-deals'taki DEAL_ENTRY_IN'den okunur -- acik bir pozisyon icin
// bu deal HER ZAMAN mevcuttur.
// Yeni eklenen order monitor'un yazacagi gibi yazilir: created_at = order'in MT5'te olustugu an
// (mutabakat ani degil), 4 LSR acisi o ana gore (bkz. lib/orderAngles.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const positionId = body?.positionId as string;
    if (!positionId) return NextResponse.json({ error: 'positionId zorunlu' }, { status: 400 });

    const positions = await fetchOpenPositions();
    const position = positions.find((p) => p.id === positionId);
    if (!position) return NextResponse.json({ error: 'Pozisyon MT5\'te artık açık değil (belki bu arada kapandı)' }, { status: 404 });

    const { rows: existingRows } = await pool.query(
      `SELECT id, status, sl, tp, entry_price, fill_price, analysis_id, created_at, opened_at,
              h1_ls_angle, m5_ls_angle, h1_tt_pos_angle, m5_tt_pos_angle
         FROM orders WHERE mt5_position_id = $1`,
      [positionId],
    );
    const existing = existingRows[0];
    // MT5'te 0 = tanimli degil
    const sl = positiveOrNull(position.stopLoss), tp = positiveOrNull(position.takeProfit);

    if (existing) {
      // Order zaten var -- status'u OPEN'a cek (yanlissa) ve sadece BIZDE BOS olan sl/tp'yi doldur
      // (doluysa DOKUNMA -- dropdown'la duzeltilmis olabilir); rr / r_target / r_risk yeniden hesaplanir.
      // Bos LSR acilari da doldurulur (dolu aciya dokunulmaz).
      if (existing.status !== 'OPEN') {
        await pool.query(`UPDATE orders SET status='OPEN', updated_at=now() WHERE id=$1`, [existing.id]);
      }
      const slTpFill = await fillBlankSlTp(existing, sl, tp);
      const angleFill = await fillBlankAngles([existing]);
      return NextResponse.json({
        ok: true, orderId: existing.id, action: 'updated', slTpFill, anglesFilled: angleFill.filled[0]?.angles ?? null,
      });
    }

    // Order HIC yok -- history-deals'taki giris deal'inden magic/comment/entry al. Emrin verildigi
    // an icin history order'lar da istenir (kisa sureli); alinamazsa acilis deal'inin zamani kullanilir.
    const [deals, histOrders] = await Promise.all([
      fetchDealsByPosition(positionId),
      fetchHistoryOrdersByPosition(positionId, HISTORY_ORDERS_TIMEOUT_MS).catch((err): MetatraderOrder[] => {
        console.warn(`fix-open: history order'lar alinamadi (${positionId}):`, err?.message);
        return [];
      }),
    ]);
    const inDeal = deals.find((d) => d.entryType === 'DEAL_ENTRY_IN');
    if (!inDeal) return NextResponse.json({ error: 'Açılış deal\'i bulunamadı' }, { status: 404 });

    const entryPrice = Number(inDeal.price ?? position.openPrice ?? 0);
    const volume = Number(inDeal.volume ?? position.volume ?? 0);
    const magic = Number(inDeal.magic ?? position.magic ?? 0);
    // Panel emri ise etiket order_intents'ten, analiz/apify bagi yok (bkz. resolveDealOrigin).
    const { analysisId, apifyRunId, strategyLabel, isSystem } = await resolveDealOrigin({ ...inDeal, magic });
    const direction = inDeal.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL';
    const { rTarget, rRisk } = await calculateRTargetRisk(isSystem ? analysisId : null, entryPrice, sl, tp);
    const createdMs = mt5OrderTimeMs(inDeal, histOrders);
    const { angles } = await computeOrderAngles([createdMs]);
    const a = angles[0];

    const { rows } = await pool.query(
      `INSERT INTO orders
         (analysis_id, apify_run_id, mt5_order_id, mt5_position_id, magic, strategy_label, symbol, direction,
          volume, entry_price, fill_price, sl, tp, rr, r_target, r_risk, status, opened_at,
          h1_ls_angle, m5_ls_angle, h1_tt_pos_angle, m5_tt_pos_angle, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'OPEN',$17,$18,$19,$20,$21,COALESCE($22::timestamptz, now()))
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
        rTarget, rRisk,
        inDeal.time,
        a.h1_ls_angle, a.m5_ls_angle, a.h1_tt_pos_angle, a.m5_tt_pos_angle,
        createdMs != null ? new Date(createdMs).toISOString() : null,
      ]
    );

    // BILEREK: order_events'e HICBIR SEY yazilmiyor.
    return NextResponse.json({ ok: true, orderId: rows[0].id, action: 'created', angles: a });
  } catch (err: any) {
    console.error('fix-open error:', err);
    return NextResponse.json({ error: err.message || 'İşlem başarısız' }, { status: 500 });
  }
}
