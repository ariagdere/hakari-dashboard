import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { fillBlankAngles } from '@/lib/orderAngles';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

// Mutabakat: son `days` gunde olusmus order'larin BOS LSR acilarini (h1/m5 LS, h1/m5 TT Position)
// doldurur -- orn. mutabakatin eski surumunun acisiz ekledigi order'lar, ya da order yazilirken
// lsr_series o ani henuz kapsamadigi icin bos kalmis acilar. Hesap monitor'unkiyle ayni
// (bkz. lib/orderAngles.ts); yalnizca bos kolonlar yazilir, dolu aciya dokunulmaz.
// O ana ait LSR verisi yoksa (seri baslamadan once, referans isinma suresi, veri boslugu) aci bos kalir;
// blank = aday olup acisi hala bos kalan order sayisi (seri baslamadan oncekiler aday sayilmaz).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(body?.days)) || DEFAULT_DAYS));

    // lsr_series'in basladigi andan once olusmus order'in acisi hic hesaplanamaz -- aday sayilmaz
    // (yoksa her mutabakatta seriler bosuna bastan okunurdu). Tablo okunamazsa sinir konmaz; hata
    // aci hesabi sirasinda raporlanir.
    let seriesStart: number | null = null;
    try {
      const { rows } = await pool.query('SELECT min(open_time) AS t FROM lsr_series');
      seriesStart = rows[0]?.t != null ? Number(rows[0].t) : null;
    } catch { /* computeOrderAngles raporlar */ }

    const { rows } = await pool.query(
      `SELECT id, mt5_position_id, status, created_at, opened_at, h1_ls_angle, m5_ls_angle, h1_tt_pos_angle, m5_tt_pos_angle
         FROM orders
        WHERE (h1_ls_angle IS NULL OR m5_ls_angle IS NULL OR h1_tt_pos_angle IS NULL OR m5_tt_pos_angle IS NULL)
          AND LEAST(created_at, opened_at) >= now() - make_interval(days => $1::int)
          AND ($2::bigint IS NULL OR LEAST(created_at, opened_at) >= to_timestamp($2::bigint / 1000.0))
        ORDER BY id`,
      [days, seriesStart],
    );

    const r = await fillBlankAngles(rows);
    const byId = new Map(rows.map((o) => [o.id, o]));
    const filled = r.filled.map((f) => ({
      orderId: f.orderId, positionId: byId.get(f.orderId)?.mt5_position_id ?? null, status: byId.get(f.orderId)?.status ?? null,
      angles: f.angles,
    }));
    if (filled.length > 0) {
      console.log(`reconcile fill-angles: ${filled.length} order'a LSR acisi yazildi (${filled.map((f) => `#${f.orderId}`).join(', ')})`);
    }
    return NextResponse.json({ days, checked: r.checked, filled, blank: r.blank, reasons: r.reasons, errors: r.errors });
  } catch (err: any) {
    console.error('reconcile fill-angles error:', err);
    return NextResponse.json({ error: err?.message || 'LSR açıları doldurulamadı' }, { status: 500 });
  }
}
