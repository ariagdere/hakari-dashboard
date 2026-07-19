import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const METAAPI_TOKEN = process.env.METAAPI_TOKEN!;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID!;
const METAAPI_REGION = process.env.METAAPI_REGION || 'london';

export async function GET() {
  try {
    const url = `https://mt-client-api-v1.${METAAPI_REGION}.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}/account-information`;

    const res = await fetch(url, {
      headers: { 'auth-token': METAAPI_TOKEN, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Account info fetch failed' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      balance: data.balance,
      currency: data.currency,
    });
  } catch (err) {
    console.error('account-info error:', err);
    return NextResponse.json({ error: 'Failed to fetch account info' }, { status: 500 });
  }
}
