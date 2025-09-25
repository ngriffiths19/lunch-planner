// app/api/kitchen/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';

// Use a string key for "no session" to keep Record<> happy
type SessionKey = '12:30' | '13:00' | 'none';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');
  if (!from || !to || !locationId) {
    return NextResponse.json({ error: 'from, to, locationId required' }, { status: 400 });
  }

  const db = supabaseService();

  // plan_lines -> plans (location/user) -> profiles (lunch_session) -> menu_items (name)
  const { data, error } = await db
    .from('plan_lines')
    .select(`
      date,
      item_id,
      menu_items!inner(name),
      plans!inner(
        location_id,
        user_id,
        profiles!inner(lunch_session)
      )
    `)
    .gte('date', from)
    .lte('date', to)
    .eq('plans.location_id', locationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  type ItemAgg = { itemId: string; name: string; qty: number };
  type SessionAgg = Record<string, ItemAgg>;
  const byDateMap: Record<string, Record<SessionKey, SessionAgg>> = {};

  for (const row of (data ?? [])) {
    const d = (row as any).date as string;
    const itemId = (row as any).item_id as string;
    const name = (row as any).menu_items.name as string;

    // Validate session to our union; map unknown/empty to "none"
    const raw = (row as any).plans?.profiles?.lunch_session as string | null | undefined;
    const sessionKey: SessionKey = raw === '12:30' || raw === '13:00' ? (raw as SessionKey) : 'none';

    // ensure buckets exist with correct types
    if (!byDateMap[d]) {
      byDateMap[d] = {} as Record<SessionKey, SessionAgg>;
    }
    if (!byDateMap[d][sessionKey]) {
      byDateMap[d][sessionKey] = {} as SessionAgg;
    }

    const bucket = byDateMap[d][sessionKey]; // SessionAgg
    if (!bucket[itemId]) {
      bucket[itemId] = { itemId, name, qty: 0 };
    }
    bucket[itemId].qty += 1;
  }

  // Order sessions 12:30, 13:00, then "none"
  const sessionOrder: SessionKey[] = ['12:30', '13:00', 'none'];

  const byDate = Object.entries(byDateMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, sessionObj]) => {
      const sessions = sessionOrder
        .filter((s) => sessionObj[s] && Object.keys(sessionObj[s]).length > 0)
        .map((s) => ({
          session: s === 'none' ? null : s, // client can show "Unassigned" for null
          items: Object.values(sessionObj[s]).sort((a, b) => a.name.localeCompare(b.name)),
        }));
      return { date, sessions };
    });

  return NextResponse.json({ byDate });
}
