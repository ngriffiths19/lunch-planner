'use client';

import { useEffect, useState } from 'react';
import MonthlyPlanner from './MonthlyPlanner';

type MenuItem = { id: string; name: string; category: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

// Read Supabase auth cookie (works on custom domains too)
function getSupabaseAccessToken(): string | null {
  const m = document.cookie.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (!m) return null;
  try {
    const raw = decodeURIComponent(m[1]);
    const parsed = JSON.parse(raw);
    // Varies by SDK version; check both shapes:
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function Page() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1) who am I?
        const rp = await fetch('/api/profile', { cache: 'no-store', credentials: 'include' });
        const pj = await rp.json();
        const locationId: string = pj?.profile?.location_id ?? HQ_LOCATION_ID;
        const u: User = {
          id: pj?.user?.id,
          name: pj?.profile?.name,
          email: pj?.user?.email,
          locationId,
        };
        setUser(u);

        // 2) menu (must include category for the new planner)
        // By default /api/menu returns only ACTIVE items (what we want)
        const rm = await fetch('/api/menu', { cache: 'no-store', credentials: 'include' });
        const mj = await rm.json();
        if (!rm.ok) throw new Error(mj.error || 'Failed to load menu');
        // Ensure each item has category
        const items: MenuItem[] = (mj.items ?? []).map((x: any) => ({
          id: String(x.id),
          name: String(x.name),
          category: String(x.category ?? 'hot'),
          active: x.active !== false,
        }));
        setMenu(items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Called by MonthlyPlanner – just forwards to /api/plan
  async function onSubmit(payload: {
    userId: string;
    locationId: string;
    month: string;                    // YYYY-MM
    lines: { date: string; itemId: string }[];
  }): Promise<void> {
    const token = getSupabaseAccessToken();
    const r = await fetch('/api/plan', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
  }

  // (Not currently used by the planner, but keep it wired)
  async function getKitchenSummary(from: string, to: string): Promise<KitchenSummary> {
    const token = getSupabaseAccessToken();
    const r = await fetch(
      `/api/kitchen?from=${from}&to=${to}&locationId=${encodeURIComponent(
        user?.locationId ?? HQ_LOCATION_ID,
      )}`,
      {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed to load');
    return j as KitchenSummary;
  }

  if (loading || !user) {
    return <div className="p-4 text-sm text-gray-600">Loading…</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <MonthlyPlanner
        menu={menu}
        user={user}
        onSubmit={onSubmit}
        getKitchenSummary={getKitchenSummary}
      />
    </div>
  );
}
