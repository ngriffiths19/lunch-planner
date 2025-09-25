'use client';

import { useEffect, useState } from 'react';
import MonthlyPlanner from './MonthlyPlanner';

type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

export default function Page() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Get current user/profile (assumes your /api/profile returns { user, profile })
        const rp = await fetch('/api/profile', { cache: 'no-store' });
        const pj = await rp.json();
        // Fall back to HQ location if not in profile
        const locationId: string = pj?.profile?.location_id ?? HQ_LOCATION_ID;
        const u: User = { id: pj?.user?.id, name: pj?.profile?.name, email: pj?.user?.email, locationId };
        setUser(u);

        // Load menu items
        const rm = await fetch('/api/menu', { cache: 'no-store' });
        const mj = await rm.json();
        setMenu((mj.items as MenuItem[]) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Handlers defined in the client (OK to pass to child)
  async function onSubmit(payload: {
    userId: string;
    locationId: string;
    month: string; // YYYY-MM
    lines: { date: string; itemId: string }[];
  }): Promise<void> {
    const r = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
  }

  async function getKitchenSummary(from: string, to: string): Promise<KitchenSummary> {
    const r = await fetch(`/api/kitchen?from=${from}&to=${to}&locationId=${(user?.locationId ?? HQ_LOCATION_ID)}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed to load');
    return j as KitchenSummary;
  }

  if (loading || !user) {
    return <div className="p-4 text-sm text-gray-600">Loading…</div>;
  }

  return (
    <div className="p-4">
      <MonthlyPlanner
        menu={menu}
        user={user}
        onSubmit={onSubmit}
        getKitchenSummary={getKitchenSummary}
      />
    </div>
  );
}
