// app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseService } from '../../lib/supabase';
import { requireRole } from '../_lib/requireRole';

export async function GET() {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ user: null, profile: null });

  const { data: profile } = await supabaseService()
    .from('profiles')
    .select('id, name, role, location_id, lunch_session')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ user, profile });
}

// Create/update basic profile fields WITHOUT touching role
export async function POST(req: NextRequest) {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const payload: {
    id: string;
    name?: string | null;
    location_id?: string | null;
    lunch_session?: '12:30' | '13:00' | null;
  } = {
    id: user.id,
    name: body.name ?? null,
    location_id: body.location_id ?? null,
    lunch_session: body.lunch_session ?? null,
  };

  // 🔑 NOTE: we DO NOT include `role` in this upsert
  const { error } = await supabaseService()
    .from('profiles')
    .upsert(payload, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Admin-only: update someone’s role explicitly
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const { id, role } = (await req.json()) as { id: string; role: 'staff' | 'catering' | 'admin' };
  if (!id || !role) return NextResponse.json({ error: 'id and role required' }, { status: 400 });

  const { error } = await supabaseService()
    .from('profiles')
    .update({ role })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
