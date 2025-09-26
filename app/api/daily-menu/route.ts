export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseService } from '../../lib/supabase';

/* Resolve authenticated user from Bearer token or Supabase cookies */
async function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (bearer) {
    const svc = supabaseService();
    const { data, error } = await svc.auth.getUser(bearer);
    if (!error && data?.user) return data.user;
  }
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  return user ?? null;
}

/* Only allow catering or admin roles */
async function assertCateringOrAdmin(userId: string) {
  const svc = supabaseService();
  const { data: prof, error } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!prof || (prof.role !== 'admin' && prof.role !== 'catering')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/daily-menu?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=UUID
 * -> { days: [{ date, itemIds: uuid[] }] }
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const forbid = await assertCateringOrAdmin(user.id);
  if (forbid) return forbid;

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');

  if (!from || !to || !locationId) {
    return NextResponse.json({ error: 'from, to, locationId required' }, { status: 400 });
  }

  const svc = supabaseService();

  // Pull rows from the single table and aggregate by date
  const { data, error } = await svc
    .from('daily_menu')
    .select('date, item_id')
    .eq('location_id', locationId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const byDate = new Map<string, string[]>();
  (data ?? []).forEach(r => {
    const d = r.date as string;
    const list = byDate.get(d) ?? [];
    list.push(r.item_id as string);
    byDate.set(d, list);
  });

  const days = Array.from(byDate.entries()).map(([date, itemIds]) => ({ date, itemIds }));
  return NextResponse.json({ days });
}

/**
 * POST /api/daily-menu
 * Body: {
 *   locationId: string,
 *   from: "YYYY-MM-DD",
 *   to: "YYYY-MM-DD",
 *   days: Array<{ date: "YYYY-MM-DD", itemIds: string[] }>
 * }
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const forbid = await assertCateringOrAdmin(user.id);
  if (forbid) return forbid;

  const body = await req.json().catch(() => ({}));
  const locationId = body?.locationId as string | undefined;
  const days = body?.days as Array<{ date: string; itemIds: string[] }> | undefined;

  if (!locationId || !Array.isArray(days)) {
    return NextResponse.json({ error: 'locationId and days[] required' }, { status: 400 });
  }

  const svc = supabaseService();

  for (const d of days) {
    const date = d?.date;
    const itemIds = Array.isArray(d?.itemIds) ? d.itemIds.filter(Boolean) : [];
    if (!date) return NextResponse.json({ error: 'Each day requires date' }, { status: 400 });

    // Remove existing rows for that location+date
    const del = await svc
      .from('daily_menu')
      .delete()
      .eq('location_id', locationId)
      .eq('date', date);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    // Insert one row per selected item
    if (itemIds.length > 0) {
      const rows = itemIds.map(item_id => ({
        date,
        location_id: locationId,
        item_id,
      }));
      const ins = await svc.from('daily_menu').insert(rows);
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
