import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// /live ekranindaki Makro Bias karti icin. btc_daily_bias tablosuna SADECE bias-data
// branch'indeki ingest Action yazar; burasi yalnizca okur.
//   latest   : en son calismanin tum alanlari (modal icin)
//   previous : bir onceki calisma (skor degisimi icin)
//   recent   : son 14 calisma, ozet alanlar (modaldaki gecmis tablosu icin)
// Tablo yoksa ya da DB'ye erisilemezse hata FIRLATMAZ; latest:null doner ve kart
// "veri yok" durumunu gosterir (red-folder-status ile ayni fail-safe yaklasim).
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, run_date::text AS run_date, generated_at, net_direction, net_direction_level,
              sentiment_score, change_24h, drivers, developments, key_development,
              divergence, divergence_note, liquidity_regime, risk_regime, conclusion,
              bias, confidence, raw_text, model, prompt_version, source_file
       FROM btc_daily_bias
       ORDER BY generated_at DESC
       LIMIT 14`
    );

    const recent = rows.map((r) => ({
      id: r.id,
      generated_at: r.generated_at,
      bias: r.bias,
      confidence: r.confidence,
      sentiment_score: r.sentiment_score,
      net_direction: r.net_direction,
    }));

    return NextResponse.json({
      latest: rows[0] ?? null,
      previous: rows[1]
        ? { generated_at: rows[1].generated_at, sentiment_score: rows[1].sentiment_score, bias: rows[1].bias }
        : null,
      recent,
    });
  } catch (err: any) {
    console.error('daily-bias error (kart bos gosterilecek):', err?.message || err);
    return NextResponse.json({ latest: null, previous: null, recent: [] });
  }
}
