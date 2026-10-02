import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// İstanbul (UTC+3, DST yok) takvim gününü 'YYYY-MM-DD' olarak döndürür.
function istanbulDateStr(d: Date): string {
  const t = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

type RedFolderEvent = { name: string; time_local: string; currency: string };

type StatusResponse = {
  // Geriye uyumlu alanlar: bugün varsa 'red', yoksa yarın varsa 'orange', ikisi de yoksa null.
  level: 'red' | 'orange' | null;
  date: string | null;
  events: RedFolderEvent[];
  // /live haber kutusu için: bugün ve yarın ayrı ayrı.
  today: { date: string; events: RedFolderEvent[] };
  tomorrow: { date: string; events: RedFolderEvent[] };
};

// /live ekranındaki haber kutusu (NewsBox) tarafından poll edilir.
// red_folder_events tablosu/migrasyonu henüz çalıştırılmadıysa (veya DB'ye erişilemezse)
// hata FIRLATMAZ -- sessizce boş listeler döner (fail-safe).
export async function GET() {
  const today = istanbulDateStr(new Date());
  const tomorrow = istanbulDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const empty: StatusResponse = {
    level: null,
    date: null,
    events: [],
    today: { date: today, events: [] },
    tomorrow: { date: tomorrow, events: [] },
  };

  try {
    // event_date ::text -- node-pg DATE'i sunucunun yerel saat diliminde gece yarisi Date'e
    // cevirir; toISOString() o zaman UTC disi sunucularda bir onceki gune kayar.
    const { rows } = await pool.query(
      `SELECT event_date::text AS event_date, event_time_local, event_name, currency
       FROM red_folder_events
       WHERE event_date = $1 OR event_date = $2
       ORDER BY event_date ASC, event_time_local ASC`,
      [today, tomorrow]
    );

    const dateStr = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
    const toEvent = (r: any): RedFolderEvent => ({
      name: r.event_name,
      time_local: String(r.event_time_local).slice(0, 5),
      currency: r.currency,
    });
    const todays = rows.filter((r) => dateStr(r.event_date) === today).map(toEvent);
    const tomorrows = rows.filter((r) => dateStr(r.event_date) === tomorrow).map(toEvent);

    const level: StatusResponse['level'] = todays.length > 0 ? 'red' : tomorrows.length > 0 ? 'orange' : null;

    const payload: StatusResponse = {
      level,
      date: level === 'red' ? today : level === 'orange' ? tomorrow : null,
      events: level === 'red' ? todays : level === 'orange' ? tomorrows : [],
      today: { date: today, events: todays },
      tomorrow: { date: tomorrow, events: tomorrows },
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('red-folder-status error (haber kutusu bos gosterilecek):', err?.message || err);
    return NextResponse.json(empty);
  }
}
