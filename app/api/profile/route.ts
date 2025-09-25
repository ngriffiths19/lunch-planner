// app/api/profile/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseService } from '../../lib/supabase';

// GET current user + profile
export async function GET() {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ user: null, profile: null });

  const { data: profile } = await supabaseService()
    .from('profiles')
    .select('id, name, role, location_id, lunch_session')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({ user, profile });
}

// Create/update basic profile fields WITHOUT touching role and WITHOUT clearing non-provided fields
export async function POST(req: NextRequest) {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Build a changes object only with keys that are present (not undefined).
  const changes: Record<string, unknown> = {};
  if ('name' in body) changes.name = (body as any).name; // allow null to explicitly clear
  if ('location_id' in body) changes.location_id = (body as any).location_id;
  if ('lunch_session' in body) changes.lunch_session = (body as any).lunch_session;

  // If nothing to change, just ensure row exists and exit
  const svc = supabaseService();
  const ensure = await svc
    .from('profiles')
    .insert({ id: user.id }, { upsert: true, onConflict: 'id' });
  if (ensure.error && ensure.error.code !== '23505') {
    // ignore duplicate key (already exists)
    return NextResponse.json({ error: ensure.error.message }, { status: 400 });
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ ok: true, noChange: true });
  }

  const upd = await svc.from('profiles').update(changes).eq('id', user.id);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
