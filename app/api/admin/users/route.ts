// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../../lib/supabase';
import { requireRole } from '../../_lib/requireRole';

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: 'staff' | 'catering' | 'admin' | null;
  lunch_session: '12:30' | '13:00' | null;
  location_id: string | null;
};

// GET: list users with roles (admin only)
export async function GET() {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const db = supabaseService();

  // 1) list auth users using admin API
  const { data: usersRes, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });

  const users = usersRes?.users ?? [];
  const ids = users.map(u => u.id);

  // 2) load matching profiles
  const { data: profiles, error: profErr } = await db
    .from('profiles')
    .select('id, name, role, lunch_session, location_id')
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });

  const profMap = new Map((profiles ?? []).map(p => [p.id as string, p]));

  const out: UserRow[] = users.map(u => {
    const p = profMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      name: (p?.name as string) ?? null,
      role: (p?.role as UserRow['role']) ?? 'staff',
      lunch_session: (p?.lunch_session as UserRow['lunch_session']) ?? null,
      location_id: (p?.location_id as string) ?? null,
    };
  });

  // Sort by email
  out.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
  return NextResponse.json({ users: out });
}

// PATCH: update role
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(['admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const body = (await req.json()) as { id?: string; role?: 'staff' | 'catering' | 'admin' };
  if (!body.id || !body.role) {
    return NextResponse.json({ error: 'id and role required' }, { status: 400 });
  }

  const db = supabaseService();
  const { error } = await db.from('profiles').upsert({
    id: body.id,
    role: body.role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
