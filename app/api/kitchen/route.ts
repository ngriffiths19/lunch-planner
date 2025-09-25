// app/api/kitchen/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '../../lib/supabase';

type SessionKey = '12:30' | '13:00' | 'none';

type MenuItemRow = { name: string };
type ProfilesRow = { lunch_session: '12:30' | '13:00' | null };
type PlansJoin = { location_id: string; user_id: string; profiles: ProfilesRow | null };
type PlanLineJoin = {
  date: string;
  item_id: string;
  menu_items: MenuItemRow;
  plans: PlansJoin;
};

type ItemAgg = { itemId: string; name: string; qty: number };
type SessionAgg = Record<string, ItemAgg>;

/* ---------- type guards (no casts, no any) ---------- */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function isMenuItemRow(v: unknown): v is MenuItemRow {
  return isRecord(v) && typeof v.name === 'string';
}
function isProfilesRow(v: unknown): v is ProfilesRow {
  return (
    isRecord(v) &&
    (v.lunch_session === null ||
      v.lunch_session === '12:30' ||
      v.lunch_session === '13:00')
  );
}
function isPlansJoin(v: unknown): v is PlansJoin {
  return (
    isRecord(v) &&
    typeof v.location_id === 'string' &&
    typeof v.user_id === 'string' &&
    (v.profiles === null || isProfilesRow(v.profiles))
  );
}
function isPlanLineJoin(v: unknown): v is PlanLineJoin {
  return (
    isRecord(v) &&
    typeof v.date === 'string' &&
    typeof v.item_id === 'string' &&
    isMenuItemRow(v.menu_items) &&
    isPlansJoin(v.plans)
  );
}

/* ---------- handler ---------- */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const locationId = url.searchParams.get('locationId');
  if (!from || !to || !locationId) {
    return NextResponse.json({ error: 'from, to, locationId required' }, { status: 400 });
  }

  const db = supabaseService();

  const { data, error } = await db
    .from('plan_lines')
    .select(`
      date,
      item_id,
      menu_items!inner(name),
      plans!inner(
        location_id,
        user_id,
        profiles!inner(lunch_session)
      )
    `)
    .gte('date', from)
    .lte('date', to)
    .eq('plans.location_id', locationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows: PlanLineJoin[] = Array.isArray(data)
    ? (data as unknown[]).filter(isPlanLineJoin)
    : [];

  const byDateMap: Record<string, Record<SessionKey, SessionAgg>> = {};

  for (const row of rows) {
    const d = row.date;
    const itemId = row.item_id;
    const name = row.menu_items.name;

    const raw = row.plans?.profiles?.lunch_session ?? null;
    const sessionKey: SessionKey = raw === '12:30' || raw === '13:00' ? raw : 'none';

    if (!byDateMap[d]) byDateMap[d] = {} as Record<SessionKey, SessionAgg>;
    if (!byDateMap[d][sessionKey]) byDateMap[d][sessionKey] = {} as SessionAgg;

    const bucket = byDateMap[d][sessionKey];
    if (!bucket[itemId]) bucket[itemId] = { itemId, name, qty: 0 };
    bucket[itemId].qty += 1;
  }

  const sessionOrder: SessionKey[] = ['12:30', '13:00', 'none'];

  const byDate = Object.entries(byDateMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, sessionObj]) => {
      const sessions = sessionOrder
        .filter((s) => sessionObj[s] && Object.keys(sessionObj[s]).length > 0)
        .map((s) => ({
          session: s === 'none' ? null : s,
          items: Object.values(sessionObj[s]).sort((a, b) => a.name.localeCompare(b.name)),
        }));
      return { date, sessions };
    });

  return NextResponse.json({ byDate });
}
