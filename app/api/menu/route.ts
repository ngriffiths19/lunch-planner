export const dynamic = 'force-dynamic'; export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseService } from '../../lib/supabase';

async function getUser() {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  return user ?? null;
}
async function assertCateringOrAdmin(userId: string) {
  const svc = supabaseService();
  const { data: p, error } = await svc.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!p || (p.role !== 'admin' && p.role !== 'catering')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// GET: list items. Only active unless ?all=1
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const all = url.searchParams.get('all') === '1';

  const svc = supabaseService();
  let q = svc.from('menu_items').select('id, name, active, category:category::text');
  if (!all) q = q.eq('active', true);
  const { data, error } = await q.order('category', { ascending: true }).order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

// POST: add { name, category }
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const forbid = await assertCateringOrAdmin(user.id); if (forbid) return forbid;

  const body = await req.json().catch(()=> ({}));
  const name = (body?.name ?? '').trim();
  const category = (body?.category ?? 'hot').trim();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const svc = supabaseService();
  const ins = await svc.from('menu_items').insert({ name, category, active: true }).select('id');
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: ins.data?.[0]?.id });
}

// PATCH: archive only { id, active:false }
export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const forbid = await assertCateringOrAdmin(user.id); if (forbid) return forbid;

  const body = await req.json().catch(()=> ({}));
  const id = body?.id as string | undefined;
  const active = body?.active as boolean | undefined;
  if (!id || typeof active !== 'boolean') {
    return NextResponse.json({ error: 'id and active required' }, { status: 400 });
  }
  if (active === true) {
    return NextResponse.json({ error: 'Unarchive is disabled. Add a new item instead.' }, { status: 400 });
  }

  const svc = supabaseService();
  const upd = await svc.from('menu_items').update({ active: false }).eq('id', id);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
