'use client';

import { useEffect, useMemo, useState } from 'react';
import MonthlyPlanner from './MonthlyPlanner';

type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

type MyDay = { date: string; items: string[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

export default function Page() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // --- load current user/profile + menu ---
  useEffect(() => {
    (async () => {
      try {
        const rp = await fetch('/api/profile', { cache: 'no-store' });
        const pj = await rp.json();
        const locationId: string = pj?.profile?.location_id ?? HQ_LOCATION_ID;
        const u: User = {
          id: pj?.user?.id,
          name: pj?.profile?.name,
          email: pj?.user?.email,
          locationId,
        };
        setUser(u);

        const rm = await fetch('/api/menu', { cache: 'no-store' });
        const mj = await rm.json();
        setMenu((mj.items as MenuItem[]) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --- handlers passed down to planner ---
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
    const r = await fetch(
      `/api/kitchen?from=${from}&to=${to}&locationId=${user?.locationId ?? HQ_LOCATION_ID}`
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed to load');
    return j as KitchenSummary;
  }

  // ---------- "My week" (user-only selections) ----------
  const [mine, setMine] = useState<MyDay[] | null>(null);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);

  // Compute this week's Mon..Fri
  const { weekFrom, weekTo } = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0..6 (Sun..Sat)
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - ((dow + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { weekFrom: fmt(monday), weekTo: fmt(friday) };
  }, []);

  async function loadMine() {
    if (!user?.locationId) {
      setMineError('No location set on your profile.');
      return;
    }
    setMineLoading(true);
    setMineError(null);
    try {
      const r = await fetch(
        `/api/plan?from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(
          weekTo
        )}&locationId=${encodeURIComponent(user.locationId)}`,
        { credentials: 'include' }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load');
      setMine(j.days as MyDay[]);
    } catch (e: any) {
      setMineError(e?.message || 'Failed to load');
    } finally {
      setMineLoading(false);
    }
  }
  // ------------------------------------------------------

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

      {/* My week controls */}
      <div className="flex items-center gap-2">
        <button className="border rounded px-3 py-2" onClick={() => void loadMine()}>
          My week ({weekFrom} → {weekTo})
        </button>
        {mineLoading && <span className="text-sm text-gray-500">Loading…</span>}
        {mineError && <span className="text-sm text-red-600">{mineError}</span>}
      </div>

      {/* My week panel */}
      {mine && (
        <div className="border rounded p-3">
          <div className="font-medium mb-1">Your selections</div>
          {mine.length === 0 ? (
            <div className="text-sm text-gray-500">No selections this week.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {mine.map((d) => (
                <li key={d.date}>
                  <span className="font-semibold">
                    {new Date(d.date).toLocaleDateString()}:
                  </span>{' '}
                  {d.items.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
