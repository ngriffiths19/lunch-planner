// app/api/profile/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseService } from '../../lib/supabase';

// GET current user + profile (read-only)
export async function GET() {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ user: null, profile: null });

  const { data: profile, error } = await supabaseService()
    .from('profiles')
    .select('id, name, role, location_id, lunch_session')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ user, profile: null, error: error.message }, { status: 400 });
  return NextResponse.json({ user, profile });
}

// Create/update basic profile fields WITHOUT touching role and WITHOUT clearing non-provided fields
export async function POST(req: NextRequest) {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only these fields are allowed to be changed here
  type ProfilePatch = {
    name?: string | null;
    location_id?: string | null;
    lunch_session?: '12:30' | '13:00' | null;
  };

  // Parse body safely
  let body: ProfilePatch = {};
  try {
    body = (await req.json()) as ProfilePatch;
  } catch {
    body = {};
  }

  // Build a changes object only for provided keys (undefined keys are ignored)
  const changes: ProfilePatch = {};
  if ('name' in body)          changes.name = body.name ?? null;                 // allow explicit clear
  if ('location_id' in body)   changes.location_id = body.location_id ?? null;
  if ('lunch_session' in body) changes.lunch_session = body.lunch_session ?? null;

  const svc = supabaseService();

  // Ensure the row exists (does NOT touch role/name/etc. beyond id)
  const { error: ensureError } = await svc
    .from('profiles')
    .upsert({ id: user.id }, { onConflict: 'id' });
  if (ensureError) {
    return NextResponse.json({ error: ensureError.message }, { status: 400 });
  }

  // Nothing to change? we're done.
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ ok: true, noChange: true });
  }

  // Merge-only update (DB trigger should also protect against NULL overwrites)
  const { error: updError } = await svc
    .from('profiles')
    .update(changes)
    .eq('id', user.id);

  if (updError) return NextResponse.json({ error: updError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
