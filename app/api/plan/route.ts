export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseService } from '../../lib/supabase';

type Cat = 'hot'|'cold_main'|'cold_side'|'cold_extra';

export async function GET(req: NextRequest) {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');
  if (!from || !to || !locationId) return NextResponse.json({ error: 'from, to, locationId required' }, { status: 400 });

  const { data, error } = await supabaseService()
    .from('plan_lines')
    .select('date, menu_items(name)')
    .gte('date', from).lte('date', to)
    .eq('plans.location_id', locationId)
    .eq('plans.user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const byDate: Record<string, string[]> = {};
  for (const r of (data ?? []) as any[]) {
    const d = r.date as string;
    const name = r.menu_items?.name as string;
    byDate[d] ??= []; byDate[d].push(name);
  }
  const out = Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, items]) => ({ date, items: items.sort() }));
  return NextResponse.json({ days: out });
}

// POST save one day
export async function POST(req: NextRequest) {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { date, locationId, hotItemId, cold } = body as {
    date: string;
    locationId: string;
    hotItemId?: string | null;
    cold?: { mainId?: string; sideId?: string; extraId?: string } | null;
  };

  if (!date || !locationId) return NextResponse.json({ error: 'date, locationId required' }, { status: 400 });

  const svc = supabaseService();

  // Determine chosen path
  const pickedHot = !!hotItemId;
  const pickedCold = !!(cold?.mainId && cold?.sideId && cold?.extraId);

  if ((pickedHot && pickedCold) || (!pickedHot && !pickedCold)) {
    return NextResponse.json({ error: 'Choose exactly one: hot OR cold bundle' }, { status: 400 });
  }

  // Validate categories when cold
  if (pickedCold) {
    const ids = [cold!.mainId!, cold!.sideId!, cold!.extraId!];
    const { data: items, error } = await svc
      .from('menu_items')
      .select('id, category')
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const cats = new Map(items?.map(x => [x.id, x.category as Cat]));
    if (cats.get(cold!.mainId!) !== 'cold_main' ||
        cats.get(cold!.sideId!) !== 'cold_side' ||
        cats.get(cold!.extraId!) !== 'cold_extra') {
      return NextResponse.json({ error: 'Cold bundle must be Main + Side + (Crisps/Fruit)' }, { status: 400 });
    }
  }

  // Ensure a plan exists for (user, date, location)
  const { data: plan, error: pErr } = await svc
    .from('plans')
    .upsert({ user_id: user.id, date, location_id: locationId }, { onConflict: 'user_id,date,location_id' })
    .select('id')
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  // Clear existing lines for that day
  const del = await svc.from('plan_lines').delete().eq('plan_id', plan!.id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  // Insert chosen lines
  if (pickedHot) {
    const { error } = await svc.from('plan_lines').insert({ plan_id: plan!.id, date, item_id: hotItemId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const rows = [
      { plan_id: plan!.id, date, item_id: cold!.mainId! },
      { plan_id: plan!.id, date, item_id: cold!.sideId! },
      { plan_id: plan!.id, date, item_id: cold!.extraId! },
    ];
    const { error } = await svc.from('plan_lines').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
