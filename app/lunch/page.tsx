'use client';

import { useEffect, useMemo, useState } from 'react';
import MonthlyPlanner from './MonthlyPlanner';
import { supabaseBrowser } from '../lib/supabase-browser';

type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };
type MyDay = { date: string; items: string[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

// ---- local date helpers ----
function fmtIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtDDMMYYYY(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export default function Page() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // --- load current user/profile + menu ---
  useEffect(() => {
    (async () => {
      try {
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

        const rm = await fetch('/api/menu', { cache: 'no-store', credentials: 'include' });
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
    const supa = supabaseBrowser();
    const { data: { session } } = await supa.auth.getSession();
    const token = session?.access_token || '';

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

  async function getKitchenSummary(from: string, to: string): Promise<KitchenSummary> {
    const r = await fetch(
      `/api/kitchen?from=${from}&to=${to}&locationId=${user?.locationId ?? HQ_LOCATION_ID}`,
      { credentials: 'include' }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed to load');
    return j as KitchenSummary;
  }

  // ---------- "My week" (user-only selections) ----------
  const [mine, setMine] = useState<MyDay[] | null>(null);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);

  // Compute THIS week's Mon..Fri in local time
  const { weekFrom, weekTo, weekFromDisp, weekToDisp } = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0..6 (Sun..Sat)
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - ((dow + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fromIso = fmtIsoLocal(monday);
    const toIso = fmtIsoLocal(friday);
    return {
      weekFrom: fromIso,
      weekTo: toIso,
      weekFromDisp: fmtDDMMYYYY(fromIso),
      weekToDisp: fmtDDMMYYYY(toIso),
    };
  }, []);

  async function loadMine() {
    if (!user?.locationId) {
      setMineError('No location set on your profile.');
      return;
    }

    const supa = supabaseBrowser();
    const { data: { session } } = await supa.auth.getSession();
    const token = session?.access_token || '';

    setMineLoading(true);
    setMineError(null);
    try {
      const r = await fetch(
        `/api/plan?from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(
          weekTo
        )}&locationId=${encodeURIComponent(user.locationId)}`,
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
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
    </div>
  );
}
