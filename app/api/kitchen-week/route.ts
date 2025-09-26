export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';
import { requireRole } from '../_lib/requireRole';

type SessionKey = '12:30'|'13:00'|'none';

export async function GET(req: NextRequest) {
  const guard = await requireRole(['catering','admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');
  if (!from || !to || !locationId) {
    return NextResponse.json({ error: 'from, to, locationId required' }, { status: 400 });
  }

  const db = supabaseService();
  const { data, error } = await db
    .from('plan_lines')
    .select(`
      date,
      item_id,
      menu_items!inner(name),
      plans!inner(location_id, user_id),
      profiles:plans!inner(profiles!inner(name, lunch_session))
    `)
    .gte('date', from).lte('date', to)
    .eq('plans.location_id', locationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const byDate: Record<string, Record<SessionKey, {
    items: Record<string, { itemId: string; name: string; qty: number }>;
    details: Record<string, { itemId: string; name: string; people: string[] }>;
  }>> = {};

  for (const r of (data ?? []) as any[]) {
    const d = r.date as string;
    const session = ((r.profiles?.profiles?.lunch_session) ?? 'none') as SessionKey;
    const itemId = r.item_id as string;
    const name = r.menu_items?.name as string;
    const person = (r.profiles?.profiles?.name as string) || 'Unknown';

    byDate[d] ??= { '12:30': { items:{}, details:{} }, '13:00': { items:{}, details:{} }, 'none': { items:{}, details:{} } };
    const bucket = byDate[d][session];

    bucket.items[itemId] ??= { itemId, name, qty: 0 };
    bucket.items[itemId].qty += 1;

    bucket.details[itemId] ??= { itemId, name, people: [] };
    bucket.details[itemId].people.push(person);
  }

  const out = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, sessions]) => {
    const sessionEntries = (['12:30','13:00','none'] as const).map(s => {
      const b = sessions[s];
      return {
        session: s,
        items: Object.values(b.items).sort((a,b)=>a.name.localeCompare(b.name)),
        details: Object.values(b.details).map(d => ({ ...d, people: d.people.sort((a,b)=>a.localeCompare(b)) })),
      };
    });
    return { date, sessions: sessionEntries };
  });

  return NextResponse.json({ byDate: out });
}
