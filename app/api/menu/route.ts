export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';
import { requireRole } from '../_lib/requireRole';

export async function GET() {
  const db = supabaseService();
  const { data, error } = await db
    .from('menu_items')
    .select('id,name,active')
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const body = (await req.json()) as { name?: string };
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const db = supabaseService();
  const { error } = await db.from('menu_items').insert({ name: body.name, active: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const body = (await req.json()) as { id: string; name?: string; active?: boolean };
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = supabaseService();
  const { error } = await db
    .from('menu_items')
    .update({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
