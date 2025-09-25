import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, locationId, month, lines } = body || {};
    if (!userId || !locationId || !month) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const db = supabaseService();

    // upsert plan (user, month, location)
    const { data: plan, error: planErr } = await db
      .from('plans')
      .upsert({ user_id: userId, location_id: locationId, month }, { onConflict: 'user_id,month' })
      .select('*')
      .single();

    if (planErr || !plan) {
      return NextResponse.json({ error: planErr?.message ?? 'Plan upsert failed' }, { status: 400 });
    }

    // compute month range (UTC-safe YYYY-MM-DD)
    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toISOString().slice(0, 10);
    const to   = new Date(Date.UTC(y, (m ?? 1), 0)).toISOString().slice(0, 10);

    // remove existing month lines
    const del = await db.rpc('delete_plan_lines_in_range', {
      p_plan_id: plan.id, p_from: from, p_to: to
    });
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    // insert new lines (if any)
    if (Array.isArray(lines) && lines.length) {
      const toInsert = lines.map((l: any) => ({ plan_id: plan.id, date: l.date, item_id: l.itemId }));
      const ins = await db.from('plan_lines').insert(toInsert);
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, planId: plan.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const locationId = url.searchParams.get('locationId');
  const month = url.searchParams.get('month'); // YYYY-MM

  if (!userId || !locationId || !month) {
    return NextResponse.json({ error: 'userId, locationId, month required' }, { status: 400 });
  }

  const db = supabaseService();

  // find the plan for this user+month
  const { data: plan, error: planErr } = await db
    .from('plans')
    .select('id')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('month', month)
    .single();

  if (planErr || !plan) return NextResponse.json({ lines: [] });

  const { data: lines, error: lineErr } = await db
    .from('plan_lines')
    .select('date, item_id')
    .eq('plan_id', plan.id);

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 400 });

  return NextResponse.json({
    lines: (lines ?? []).map(l => ({ date: l.date, itemId: l.item_id })),
  });
}