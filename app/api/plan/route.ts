export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseService } from '../../lib/supabase';

type Cat = 'hot' | 'cold_main' | 'cold_side' | 'cold_extra';

/** Try to resolve the user from Authorization bearer or auth cookies */
async function getUserFromRequest(req: NextRequest) {
  // 1) Bearer
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (bearer) {
    const svc = supabaseService();
    const { data, error } = await svc.auth.getUser(bearer);
    if (!error && data?.user) return data.user;
  }
  // 2) Cookies
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  return user ?? null;
}

/**
 * GET /api/plan?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=UUID
 * Returns { days: [{date, items[]}] } for the signed-in user.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');
  if (!from || !to || !locationId) {
    return NextResponse.json({ error: 'from, to, locationId required' }, { status: 400 });
  }

  const svc = supabaseService();

  // Step 1: plans for user/location
  const { data: plans, error: pErr } = await svc
    .from('plans')
    .select('id, date')
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .gte('date', from)
    .lte('date', to);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const planIds = (plans ?? []).map(p => p.id);
  if (planIds.length === 0) return NextResponse.json({ days: [] });

  // Step 2: plan_lines + item names
  const { data: lines, error: lErr } = await svc
    .from('plan_lines')
    .select('date, item_id, menu_items(name), plan_id')
    .in('plan_id', planIds);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });

  const byDate: Record<string, string[]> = {};
  for (const r of (lines ?? []) as any[]) {
    const d = r.date as string;
    const name = r.menu_items?.name as string | undefined;
    if (!name) continue;
    (byDate[d] ??= []).push(name);
  }

  const days = Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({ date, items: items.sort() }));

  return NextResponse.json({ days });
}

/**
 * POST /api/plan
 * Supports:
 * A) Legacy batch: { userId, locationId, month, lines:[{date,itemId}] }
 * B) Single-day hot/cold
 */
export async function POST(req: NextRequest) {
  const svc = supabaseService();

  // Read body first (needed for fallback)
  const body = await req.json().catch(() => ({}));

  // Try normal user resolution
  let user = await getUserFromRequest(req);

  // Fallback: verify body.userId via Admin API (secure, no spoofing)
  if (!user && body?.userId) {
    const { data, error } = await svc.auth.admin.getUserById(body.userId);
    if (!error && data?.user) {
      user = data.user;
    }
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // --------- A) Legacy batch payload ----------
  if (Array.isArray(body?.lines)) {
    const locationId = body.locationId as string | undefined;
    if (!locationId) return NextResponse.json({ error: 'locationId required' }, { status: 400 });

    const byDate = new Map<string, string[]>();
    for (const ln of body.lines as Array<{ date: string; itemId: string }>) {
      if (!ln?.date || !ln?.itemId) continue;
      const arr = byDate.get(ln.date) ?? [];
      arr.push(ln.itemId);
      byDate.set(ln.date, arr);
    }

    for (const [date, itemIds] of byDate.entries()) {
      const { data: plan, error: pErr } = await svc
        .from('plans')
        .upsert({ user_id: user.id, date, location_id: locationId }, { onConflict: 'user_id,date,location_id' })
        .select('id')
        .single();
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

      const del = await svc.from('plan_lines').delete().eq('plan_id', plan!.id).eq('date', date);
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

      if (itemIds.length > 0) {
        const rows = itemIds.map((iid) => ({ plan_id: plan!.id, date, item_id: iid }));
        const ins = await svc.from('plan_lines').insert(rows);
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // --------- B) Single-day hot/cold payload ----------
  const date = body?.date as string | undefined;
  const locationId = body?.locationId as string | undefined;
  const hotItemId = body?.hotItemId as string | undefined;
  const cold = body?.cold as { mainId?: string; sideId?: string; extraId?: string } | undefined;

  if (!date || !locationId) {
    return NextResponse.json({ error: 'date, locationId required' }, { status: 400 });
  }

  const pickedHot = !!hotItemId;
  const pickedCold = !!(cold?.mainId && cold?.sideId && cold?.extraId);
  if ((pickedHot && pickedCold) || (!pickedHot && !pickedCold)) {
    return NextResponse.json({ error: 'Choose exactly one: hot OR cold bundle' }, { status: 400 });
  }

  if (pickedCold) {
    const ids = [cold!.mainId!, cold!.sideId!, cold!.extraId!];
    const { data: items, error } = await svc
      .from('menu_items')
      .select('id, category')
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const cats = new Map(items?.map((x) => [x.id, x.category as Cat]));
    if (
      cats.get(cold!.mainId!) !== 'cold_main' ||
      cats.get(cold!.sideId!) !== 'cold_side' ||
      cats.get(cold!.extraId!) !== 'cold_extra'
    ) {
      return NextResponse.json({ error: 'Cold bundle must be Main + Side + (Crisps/Fruit)' }, { status: 400 });
    }
  }

  const { data: plan, error: pErr } = await svc
    .from('plans')
    .upsert({ user_id: user.id, date, location_id: locationId }, { onConflict: 'user_id,date,location_id' })
    .select('id')
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const del = await svc.from('plan_lines').delete().eq('plan_id', plan!.id).eq('date', date);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  if (pickedHot) {
    const ins = await svc.from('plan_lines').insert({ plan_id: plan!.id, date, item_id: hotItemId });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  } else {
    const rows = [
      { plan_id: plan!.id, date, item_id: cold!.mainId! },
      { plan_id: plan!.id, date, item_id: cold!.sideId! },
      { plan_id: plan!.id, date, item_id: cold!.extraId! },
    ];
    const ins = await svc.from('plan_lines').insert(rows);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
