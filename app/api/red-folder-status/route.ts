import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// İstanbul (UTC+3, DST yok) takvim gününü 'YYYY-MM-DD' olarak döndürür.
function istanbulDateStr(d: Date): string {
  const t = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

type StatusResponse = {
  level: 'red' | 'orange' | null;
  date: string | null;
  events: { name: string; time_local: string; currency: string }[];
};

// RedFolderBanner bileşeni tarafından poll edilir. Bugün (İstanbul takvimi) bir
// USD red folder haberi varsa 'red', yoksa yarın varsa 'orange', ikisi de yoksa null.
// red_folder_events tablosu/migrasyonu henüz çalıştırılmadıysa (veya DB'ye erişilemezse)
// hata FIRLATMAZ -- sessizce level:null döner, banner o zaman görünmez (fail-safe).
export async function GET() {
  const today = istanbulDateStr(new Date());
  const tomorrow = istanbulDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));

  try {
    const { rows } = await pool.query(
      `SELECT event_date, event_time_local, event_name, currency
       FROM red_folder_events
       WHERE event_date = $1 OR event_date = $2
       ORDER BY event_date ASC, event_time_local ASC`,
      [today, tomorrow]
    );

    const dateStr = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
    const todays = rows.filter((r) => dateStr(r.event_date) === today);
    const tomorrows = rows.filter((r) => dateStr(r.event_date) === tomorrow);

    const level: StatusResponse['level'] = todays.length > 0 ? 'red' : tomorrows.length > 0 ? 'orange' : null;
    const chosen = level === 'red' ? todays : level === 'orange' ? tomorrows : [];

    const payload: StatusResponse = {
      level,
      date: level === 'red' ? today : level === 'orange' ? tomorrow : null,
      events: chosen.map((r) => ({
        name: r.event_name,
        time_local: String(r.event_time_local).slice(0, 5),
        currency: r.currency,
      })),
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('red-folder-status error (banner gizlenecek):', err?.message || err);
    return NextResponse.json({ level: null, date: null, events: [] } as StatusResponse);
  }
}
