// app/api/menu/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';
import { requireRole } from '../_lib/requireRole';

// ===== GET: list items =====
export async function GET() {
  const { data, error } = await supabaseService()
    .from('menu_items')
    .select('id,name,active')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

// ===== POST: create/update item =====
export async function POST(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const body = await req.json();
  const { id, name, active } = body as { id?: string; name: string; active?: boolean };

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const svc = supabaseService();
  if (id) {
    const { error } = await svc
      .from('menu_items')
      .update({ name, active: active ?? true })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id });
  } else {
    const { data, error } = await svc
      .from('menu_items')
      .insert({ name, active: active ?? true })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id });
  }
}

// ===== DELETE: archive (soft) by default; hard delete with ?hard=true =====
export async function DELETE(req: NextRequest) {
  const guard = await requireRole(['catering', 'admin']);
  if (!guard.ok) return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const hard = searchParams.get('hard') === 'true';

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const svc = supabaseService();

  if (!hard) {
    // Soft delete → mark inactive
    const { error } = await svc.from('menu_items').update({ active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, archived: true });
  }

  // Hard delete → may fail with FK constraint if referenced
  const { error } = await svc.from('menu_items').delete().eq('id', id);
  if (error) {
    // 23503 = foreign key violation
    const status = (error as any).code === '23503' ? 409 : 400;
    const msg =
      (error as any).code === '23503'
        ? 'Cannot delete: item is referenced by existing plans/options.'
        : error.message;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json({ ok: true, deleted: true });
}
