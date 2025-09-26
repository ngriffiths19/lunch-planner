// app/api/menu/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';
import { requireRole } from '../_lib/requireRole';

// GET: only active items (sorted)
export async function GET() {
  const { data, error } = await supabaseService()
    .from('menu_items')
    .select('id,name,active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

// POST: create or update; requires catering/admin
export async function POST(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const { id, name, active } = body as { id?: string; name?: string; active?: boolean };
  const svc = supabaseService();

  // Update by id (rename / toggle active)
  if (id) {
    const patch: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) patch.name = name.trim();
    if (typeof active === 'boolean') patch.active = active;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, noChange: true });
    }

    const { error } = await svc.from('menu_items').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id });
  }

  // Create: reactivate same-name if it exists (case-insensitive), else insert new
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const clean = name.trim();

  // Try to find an existing row by name (case-insensitive)
  const { data: existing, error: findErr } = await svc
    .from('menu_items')
    .select('id, active')
    .filter('name', 'ilike', clean) // exact string, case-insensitive, no wildcards
    .limit(1)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });

  if (existing) {
    // Reactivate (and normalize casing if desired)
    const { error } = await svc
      .from('menu_items')
      .update({ active: true, name: clean })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: existing.id, reactivated: true });
  }

  // Insert brand new
  const { data: created, error: insErr } = await svc
    .from('menu_items')
    .insert({ name: clean, active: true })
    .select('id')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: created?.id });
}

// PATCH: archive (hide) – requires catering/admin
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabaseService()
    .from('menu_items')
    .update({ active: false })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, archived: true });
}
