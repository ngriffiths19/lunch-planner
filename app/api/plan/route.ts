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

  // 1) wipe this user's month plan at this location
  const del = await svc.from('plans')
    .delete()
    .eq('user_id', user.id)
    .eq('location_id', locationId)
    .eq('month', month);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  // 2) nothing to insert? ok
  if (lines.length === 0) return NextResponse.json({ ok: true });

  // 3) de-dupe lines by (date,itemId)
  const seen = new Set<string>();
  const rows = [];
  for (const { date, itemId } of lines) {
    if (!date || !itemId) continue;
    const key = `${date}::${itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      user_id: user.id,
      location_id: locationId,
      month,
      date,
      item_id: itemId,
    });
  }

  if (rows.length === 0) return NextResponse.json({ ok: true });

  const ins = await svc.from('plans').insert(rows);
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
