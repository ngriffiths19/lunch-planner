export const dynamic = 'force-dynamic'; export const revalidate = 0;
import { NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';

export async function GET() {
  const svc = supabaseService();
  const { data, error } = await svc
    .from('menu_items')
    .select('id, name, active, category')   // no archived here
    .eq('active', true)                      // keep active filter
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}
