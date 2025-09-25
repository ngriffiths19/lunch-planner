export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';
import { requireRole } from '../_lib/requireRole';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');
  if (!from || !to || !locationId) {
    return NextResponse.json({ error: 'from,to,locationId required' }, { status: 400 });
  }
  const db = supabaseService();
  const { data, error } = await db
    .from('daily_menu')
    .select('date,item_id')
    .gte('date', from).lte('date', to)
    .eq('location_id', locationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const d = row.date as string;
    (map[d] ||= []).push(row.item_id as string);
  }
  return NextResponse.json({ map });
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const body = (await req.json()) as {
    date: string;
    locationId: string;
    itemIds: string[];
  };
  if (!body.date || !body.locationId || !Array.isArray(body.itemIds)) {
    return NextResponse.json({ error: 'date,locationId,itemIds required' }, { status: 400 });
  }

  const db = supabaseService();

  const del = await db
    .from('daily_menu')
    .delete()
    .eq('date', body.date)
    .eq('location_id', body.locationId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  if (body.itemIds.length) {
    const rows = body.itemIds.map((id) => ({
      date: body.date,
      location_id: body.locationId,
      item_id: id,
    }));
    const ins = await db.from('daily_menu').insert(rows);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
