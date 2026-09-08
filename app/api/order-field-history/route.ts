import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EPS = 0.01; // fiyat karsilastirma toleransi (raw_payload'daki ham float ile
                   // NUMERIC(18,5) sutunu arasinda kucuk farklar olabilir)

interface ModifiedEvent {
  old_value: string | null;
  new_value: string | null;
  raw_payload: { stopLoss?: number; takeProfit?: number; openPrice?: number } | null;
  event_time: string;
}

// order_events'teki MODIFIED satirlarinda HANGI alanin (SL/TP/entry) degistigini
// gosteren ayri bir sutun YOK -- ama insertOrderEvent HER ZAMAN rawPayload'i
// (MetaAPI'nin o anki TAM order/pozisyon objesini) de kaydediyor. new_value'yu
// raw_payload.stopLoss / .takeProfit / .openPrice ile eslestirerek, HANGI
// alanin degistigini kesin olarak belirleriz -- entry'ye gore konum tahmini
// gibi kirilgan bir yontem KULLANMAYIZ.
function classify(newValue: number | null, payload: ModifiedEvent['raw_payload']): 'sl' | 'tp' | 'entry' | null {
  if (payload == null || newValue == null) return null;
  const sl = payload.stopLoss != null ? Number(payload.stopLoss) : null;
  const tp = payload.takeProfit != null ? Number(payload.takeProfit) : null;
  const op = payload.openPrice != null ? Number(payload.openPrice) : null;
  if (sl != null && Math.abs(sl - newValue) < EPS) return 'sl';
  if (tp != null && Math.abs(tp - newValue) < EPS) return 'tp';
  if (op != null && Math.abs(op - newValue) < EPS) return 'entry';
  return null;
}

function buildFieldHistory(events: ModifiedEvent[], field: 'sl' | 'tp'): { value: number; eventTime: string }[] {
  const classified = events
    .map((e) => ({ ...e, field: classify(e.new_value != null ? Number(e.new_value) : null, e.raw_payload) }))
    .filter((e) => e.field === field);
  if (classified.length === 0) return [];

  const result: { value: number; eventTime: string }[] = [];
  const seen = new Set<string>();
  const pushIfNew = (value: number | null, eventTime: string) => {
    if (value == null) return;
    const key = value.toFixed(2);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ value, eventTime });
  };

  // ILK bilinen deger: en eski MODIFIED olayinin old_value'su (o degisiklikten
  // ONCEKI durumu temsil eder).
  pushIfNew(classified[0].old_value != null ? Number(classified[0].old_value) : null, classified[0].event_time);
  for (const e of classified) {
    pushIfNew(e.new_value != null ? Number(e.new_value) : null, e.event_time);
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId');
    if (!orderId || !/^\d+$/.test(orderId)) {
      return NextResponse.json({ error: 'Geçerli bir orderId gerekli' }, { status: 400 });
    }

    const { rows: modifiedRows } = await pool.query(
      `SELECT old_value, new_value, raw_payload, event_time
       FROM order_events
       WHERE order_id = $1 AND event_type = 'MODIFIED'
       ORDER BY event_time ASC`,
      [orderId]
    );

    const { rows: orderRows } = await pool.query(`SELECT sl, tp FROM orders WHERE id = $1`, [orderId]);
    const currentSl = orderRows[0]?.sl != null ? Number(orderRows[0].sl) : null;
    const currentTp = orderRows[0]?.tp != null ? Number(orderRows[0].tp) : null;

    const slValues = buildFieldHistory(modifiedRows, 'sl');
    const tpValues = buildFieldHistory(modifiedRows, 'tp');

    // Guncel orders.sl/tp, olaylardan cikarilan zincirde HER ZAMAN yer almali
    // -- olay kaydinda bir bosluk/eksiklik olsa bile guncel deger dropdown'da
    // kaybolmasin diye.
    if (currentSl != null && !slValues.some((v) => Math.abs(v.value - currentSl) < EPS)) {
      slValues.push({ value: currentSl, eventTime: 'güncel' });
    }
    if (currentTp != null && !tpValues.some((v) => Math.abs(v.value - currentTp) < EPS)) {
      tpValues.push({ value: currentTp, eventTime: 'güncel' });
    }

    return NextResponse.json({ slValues, tpValues });
  } catch (err) {
    console.error('order-field-history error:', err);
    return NextResponse.json({ error: 'Geçmiş alınamadı' }, { status: 500 });
  }
}
