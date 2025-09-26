export const dynamic = 'force-dynamic'; export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseService } from '../../lib/supabase';

type Line = { date: string; itemId: string };

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

function yyyymm(dIso: string) {
  const [y, m] = dIso.split('-');
  return `${y}-${m}`;
}

/** GET /api/plan?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=UUID
 *  -> { days: [{ date, items: string[] }] } for the authenticated user
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
  // Find header(s) for user + location + month window
  const { data: headers, error: hErr } = await svc
    .from('plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .gte('month', yyyymm(from))
    .lte('month', yyyymm(to));

  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 });
  if (!headers || headers.length === 0) return NextResponse.json({ days: [] });

  const planIds = headers.map(h => h.id);
  // Pull lines within date window; join to menu_items for names
  const { data: lines, error: lErr } = await svc
    .from('plan_lines')
    .select('date, menu_items!inner(name)')
    .in('plan_id', planIds)
    .gte('date', from)
    .lte('date', to);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });

  const byDate = new Map<string, string[]>();
  (lines ?? []).forEach(r => {
    const d = r.date as string;
    const n = (r as any).menu_items?.name as string;
    const list = byDate.get(d) ?? [];
    if (n) list.push(n);
    byDate.set(d, list);
  });

  const days = Array.from(byDate.entries()).map(([date, items]) => ({ date, items }));
  return NextResponse.json({ days });
}

/** POST /api/plan
 * Body: { locationId: string, month?: "YYYY-MM", lines: [{date, itemId}] }
 * Replaces the month’s plan for the authenticated user.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const locationId: string | undefined = body?.locationId;
  const lines: Line[] = Array.isArray(body?.lines) ? body.lines : [];
  const month: string | undefined = body?.month || (lines[0]?.date ? yyyymm(lines[0].date) : undefined);
  if (!locationId || !month) {
    return NextResponse.json({ error: 'locationId and month required' }, { status: 400 });
  }

  const svc = supabaseService();

  // Upsert header (unique constraint (user_id, month) assumed)
  const { data: header, error: upErr } = await svc
    .from('plans')
    .upsert({ user_id: user.id, location_id: locationId, month }, { onConflict: 'user_id,month' })
    .select('id')
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Replace lines for that header
  const del = await svc.from('plan_lines').delete().eq('plan_id', header.id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  if (lines.length === 0) return NextResponse.json({ ok: true });

  const seen = new Set<string>();
  const rows = [];
  for (const { date, itemId } of lines) {
    if (!date || !itemId) continue;
    const key = `${date}::${itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ plan_id: header.id, date, item_id: itemId });
  }
  if (rows.length === 0) return NextResponse.json({ ok: true });

  const ins = await svc.from('plan_lines').insert(rows);
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
