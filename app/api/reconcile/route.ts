import pool from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const METAAPI_TOKEN = process.env.METAAPI_TOKEN!;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID!;
const METAAPI_REGION = process.env.METAAPI_REGION || 'london';
const VOLUME_EPS = 0.001; // mt5_order_monitor.js'teki isFinalClose ile AYNI tolerans

interface MetatraderDeal {
  id: string;
  entryType: string;
  positionId?: string;
  volume?: number;
  time: string;
  symbol?: string;
  profit?: number;
}

interface Discrepancy {
  type: 'ORDER_MISSING' | 'SHOULD_BE_CLOSED_BUT_ISNT';
  mt5PositionId: string;
  symbol: string | null;
  mt5TotalClosedVolume: number;
  orderId: number | null;
  orderStatus: string | null;
  orderVolume: number | null;
  lastDealTime: string;
}

// MT5'teki GERCEK deal gecmisini (Read deals by time range), bizim
// orders/order_events tablomuzla karsilastirir. mt5_order_monitor.js'in
// streaming/resync mekanizmasina TAMAMEN BAGIMSIZ bir dogrulama katmani --
// baglanti kopmasi ya da baska bir hata nedeniyle KACAN bir kapanisi
// yakalamak icin.
export async function GET(req: NextRequest) {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.nextUrl.searchParams.get('hours') ?? '24')));
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 3600 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z'); // MetaAPI ISO formati

    const url = `https://mt-client-api-v1.${METAAPI_REGION}.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}/history-deals/time/${fmt(startTime)}/${fmt(endTime)}?limit=1000`;
    const res = await fetch(url, {
      headers: { 'auth-token': METAAPI_TOKEN, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `MetaApi history-deals fetch başarısız (HTTP ${res.status})` }, { status: 502 });
    }
    const deals: MetatraderDeal[] = await res.json();

    // Sadece kapanis deal'leri (DEAL_ENTRY_OUT), positionId'ye gore grupla --
    // ayni positionId icin BIRDEN FAZLA kismi kapanis olabilir, toplam
    // kapatilan hacmi (mt5_order_monitor.js'teki isFinalClose ile AYNI
    // mantikla) hesaplamamiz gerekiyor.
    const closesByPosition = new Map<string, { totalVolume: number; symbol: string | null; lastTime: string }>();
    for (const d of deals) {
      if (d.entryType !== 'DEAL_ENTRY_OUT' || !d.positionId) continue;
      const existing = closesByPosition.get(d.positionId);
      const vol = Number(d.volume ?? 0);
      if (existing) {
        existing.totalVolume += vol;
        if (d.time > existing.lastTime) existing.lastTime = d.time;
      } else {
        closesByPosition.set(d.positionId, { totalVolume: vol, symbol: d.symbol ?? null, lastTime: d.time });
      }
    }

    if (closesByPosition.size === 0) {
      return NextResponse.json({ checkedHours: hours, dealCount: deals.length, discrepancies: [] });
    }

    const positionIds = Array.from(closesByPosition.keys());
    const { rows: orderRows } = await pool.query(
      `SELECT id, mt5_position_id, status, volume FROM orders WHERE mt5_position_id = ANY($1::text[])`,
      [positionIds]
    );
    const orderByPositionId = new Map(orderRows.map((r) => [r.mt5_position_id, r]));

    const discrepancies: Discrepancy[] = [];
    Array.from(closesByPosition.entries()).forEach(([positionId, close]) => {
      const order = orderByPositionId.get(positionId);
      if (!order) {
        discrepancies.push({
          type: 'ORDER_MISSING', mt5PositionId: positionId, symbol: close.symbol,
          mt5TotalClosedVolume: close.totalVolume, orderId: null, orderStatus: null, orderVolume: null,
          lastDealTime: close.lastTime,
        });
        return;
      }
      const orderVolume = Number(order.volume);
      const fullyClosedInMt5 = close.totalVolume >= orderVolume - VOLUME_EPS;
      if (fullyClosedInMt5 && order.status !== 'CLOSED') {
        discrepancies.push({
          type: 'SHOULD_BE_CLOSED_BUT_ISNT', mt5PositionId: positionId, symbol: close.symbol,
          mt5TotalClosedVolume: close.totalVolume, orderId: order.id, orderStatus: order.status, orderVolume,
          lastDealTime: close.lastTime,
        });
      }
    });

    return NextResponse.json({ checkedHours: hours, dealCount: deals.length, discrepancies });
  } catch (err) {
    console.error('reconcile error:', err);
    return NextResponse.json({ error: 'Mutabakat kontrolü başarısız' }, { status: 500 });
  }
}
