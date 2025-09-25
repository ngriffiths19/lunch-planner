import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';

export function GET() {
  return NextResponse.json({ ok: true, route: 'profile' });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    userId?: string;
    name?: string; // legacy
    firstName?: string;
    lastName?: string;
    lunchSession?: '12:30' | '13:00';
    role?: 'staff' | 'catering' | 'admin';
    locationId?: string;
  };

  const { userId, firstName, lastName, lunchSession, role = 'staff', locationId } = body;
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const db = supabaseService();

  let loc = locationId;
  if (!loc) {
    const { data: locRow, error: locErr } = await db
      .from('locations').select('id').eq('active', true).limit(1).single();
    if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 });
    loc = locRow?.id as string;
  }

  const { error } = await db.from('profiles').upsert({
    id: userId,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    lunch_session: lunchSession ?? null,
    role,
    location_id: loc
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
