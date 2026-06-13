import { NextResponse } from 'next/server';

const METAAPI_TOKEN = process.env.METAAPI_TOKEN!;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID!;
const METAAPI_REGION = process.env.METAAPI_REGION || 'london';

export async function GET() {
  try {
    const url = `https://mt-client-api-v1.${METAAPI_REGION}.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/BTCUSD/current-price`;

    const res = await fetch(url, {
      headers: {
        'auth-token': METAAPI_TOKEN,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Price fetch failed' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      bid: data.bid,
      ask: data.ask,
      time: data.time,
    });
  } catch (err) {
    console.error('live-price error:', err);
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 });
  }
}
