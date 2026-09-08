import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Ayri bir lookup tablosu yok -- orders.strategy_label duz bir metin sutunu,
// bu yuzden "mevcut tum label'lar" o sutundaki distinct degerlerden gelir.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT strategy_label FROM orders WHERE strategy_label IS NOT NULL ORDER BY strategy_label ASC`
    );
    return NextResponse.json({ labels: rows.map((r) => r.strategy_label as string) });
  } catch (err) {
    console.error('strategy-labels error:', err);
    return NextResponse.json({ error: 'Etiketler alınamadı' }, { status: 500 });
  }
}
