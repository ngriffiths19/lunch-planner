// app/lunch/MonthlyPlanner.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };

type PlannerLine = { date: string; itemId: string };
type PlannerPayload = {
  userId: string;
  locationId: string;
  month: string; // YYYY-MM
  lines: PlannerLine[];
};

type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

/* ---------- UTC-safe date helpers ---------- */
const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD
const yyyymm = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const startOfMonth = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const endOfMonth = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
const addDays = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const getUTCDay = (d: Date) => d.getUTCDay(); // 0=Sun..6=Sat

// Monday on/before given date
const startOfWeekMon = (d: Date) => {
  const dow = getUTCDay(d); // 0..6
  const offset = dow === 0 ? -6 : 1 - dow; // move back to Monday
  return addDays(d, offset);
};

interface Props {
  menu: MenuItem[];
  user: User;
  onSubmit: (payload: PlannerPayload) => Promise<void> | void;
  getKitchenSummary: (from: string, to: string) => Promise<KitchenSummary>;
}

export default function MonthlyPlanner({ menu, user, onSubmit, getKitchenSummary }: Props) {
  const [tab, setTab] = useState<'plan' | 'kitchen'>('plan');

  // month cursor pinned to UTC 1st of month
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });

  // selections: YYYY-MM-DD -> itemId
  const [selections, setSelections] = useState<Record<string, string>>({});

  // per-day allowed items: date -> Set(itemId)
  const [allowedMap, setAllowedMap] = useState<Record<string, Set<string>>>({});

  // kitchen summary state
  const [summary, setSummary] = useState<KitchenSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const menuActive = useMemo(() => menu.filter(m => m.active ?? true), [menu]);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd   = useMemo(() => endOfMonth(cursor),   [cursor]);
  const monthKey   = useMemo(() => yyyymm(cursor),       [cursor]);

  /* ---------- build a correct Mon–Fri calendar matrix ---------- */
  const weeks = useMemo(() => {
    const firstMonday = startOfWeekMon(monthStart);
    const lastFriday  = addDays(startOfWeekMon(monthEnd), 4);
    const rows: Date[][] = [];
    for (let wkStart = firstMonday; wkStart <= lastFriday; wkStart = addDays(wkStart, 7)) {
      rows.push([
        addDays(wkStart, 0), // Mon
        addDays(wkStart, 1), // Tue
        addDays(wkStart, 2), // Wed
        addDays(wkStart, 3), // Thu
        addDays(wkStart, 4), // Fri
      ]);
    }
    return rows;
  }, [monthStart, monthEnd]);

  function setChoice(day: Date, itemId: string) {
    setSelections(prev => ({ ...prev, [fmt(day)]: itemId }));
  }

  async function handleSubmit() {
    const lines: PlannerLine[] = Object.entries(selections)
      .filter(([, itemId]) => !!itemId)
      .map(([date, itemId]) => ({ date, itemId }));

    const payload: PlannerPayload = {
      userId: user.id,
      locationId: user.locationId,
      month: monthKey,
      lines,
    };
    await onSubmit(payload);
  }

  /* ---------- preload existing selections for this month ---------- */
  async function loadMonth(userId: string, locationId: string, month: string) {
    const res = await fetch(`/api/plan?userId=${userId}&locationId=${locationId}&month=${month}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Failed to load plan');
    return (j.lines as { date: string; itemId: string }[]) ?? [];
  }

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const lines = await loadMonth(user.id, user.locationId, monthKey);
        if (gone) return;
        const map: Record<string, string> = {};
        for (const l of lines) map[l.date] = l.itemId;
        setSelections(map);
      } catch {
        if (!gone) setSelections({});
      }
    })();
    return () => { gone = true; };
    // monthKey covers month & year; user controls account scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.locationId, monthKey]);

  /* ---------- load per-day allowed items for this month ---------- */
  async function loadAllowed(from: string, to: string, locationId: string) {
    const r = await fetch(`/api/daily-menu?from=${from}&to=${to}&locationId=${locationId}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'failed to load allowed items');
    const map: Record<string, Set<string>> = {};
    const raw = (j.map as Record<string, string[]>) || {};
    for (const [date, arr] of Object.entries(raw)) {
      map[date] = new Set(arr);
    }
    setAllowedMap(map);
  }

  useEffect(() => {
    loadAllowed(fmt(monthStart), fmt(monthEnd), user.locationId).catch(() => setAllowedMap({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart.getTime(), monthEnd.getTime(), user.locationId]);

  /* ---------- kitchen summary loader ---------- */
  useEffect(() => {
    if (tab !== 'kitchen') return;
    let gone = false;
    (async () => {
      try {
        setLoadingSummary(true);
        setSummaryError(null);
        const res = await getKitchenSummary(fmt(monthStart), fmt(monthEnd));
        if (!gone) setSummary(res);
      } catch (e: unknown) {
        if (!gone) setSummaryError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!gone) setLoadingSummary(false);
      }
    })();
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, monthStart.getTime(), monthEnd.getTime()]);

  /* ---------- pretty UI helpers ---------- */
  const todayKey = fmt(new Date());

  const cellBase =
    'rounded-xl border p-2 bg-white shadow-sm hover:shadow transition-shadow';
  const outMonthCls = 'opacity-45';
  const todayCls =
    'ring-2 ring-blue-500/40 ring-offset-2';
  const headerCls =
    'sticky top-0 z-10 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60';

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="inline-flex rounded-xl border overflow-hidden">
        <button
          className={`px-4 py-2 text-sm ${tab === 'plan' ? 'bg-black text-white' : ''}`}
          onClick={() => setTab('plan')}
        >
          Planner
        </button>
        <button
          className={`px-4 py-2 text-sm ${tab === 'kitchen' ? 'bg-black text-white' : ''}`}
          onClick={() => setTab('kitchen')}
        >
          Kitchen
        </button>
      </div>

      {/* Month controls */}
      <div className="flex items-center gap-3">
        <button
          className="border rounded-lg px-3 py-1"
          onClick={() =>
            setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1)))
          }
        >
          ← Prev
        </button>
        <div className="font-medium">
          {cursor.toLocaleString(undefined, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </div>
        <button
          className="border rounded-lg px-3 py-1"
          onClick={() =>
            setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)))
          }
        >
          Next →
        </button>
      </div>

      {tab === 'plan' ? (
        <>
          {/* Weekday headers */}
          <div className={`grid grid-cols-5 text-xs text-gray-600 px-1 ${headerCls}`}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((h) => (
              <div key={h} className="px-2 py-1 font-semibold">
                {h}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid gap-3">
            {weeks.map((row, ri) => (
              <div key={ri} className="grid grid-cols-5 gap-3">
                {row.map((d) => {
                  const key = fmt(d);
                  const outOfMonth = d.getUTCMonth() !== cursor.getUTCMonth();
                  const isToday = key === todayKey;

                  // allowed options for this day (fallback to all active if undefined)
                  const allowedSet = allowedMap[key];
                  const options = allowedSet
                    ? menuActive.filter(m => allowedSet.has(m.id))
                    : menuActive;

                  return (
                    <div
                      key={key}
                      className={`${cellBase} ${outOfMonth ? outMonthCls : ''} ${
                        isToday ? todayCls : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold">{d.getUTCDate()}</div>
                        <div className="text-[10px] text-gray-500">{key}</div>
                      </div>
                      <select
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={selections[key] ?? ''}
                        onChange={(e) => setChoice(d, e.target.value)}
                      >
                        <option value="">—</option>
                        {options.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="border rounded-xl px-3 py-2"
              type="button"
              onClick={() => setSelections({})}
              title="Clear local selections for this month (won’t persist until you submit)"
            >
              Clear month
            </button>
            <button className="border rounded-xl px-4 py-2" onClick={handleSubmit}>
              Submit / Update Monthly Plan
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {fmt(monthStart)} → {fmt(monthEnd)}
            </div>
            <button
              className="border rounded-lg px-3 py-1"
              onClick={() => {
                setTab('plan');
                setTimeout(() => setTab('kitchen'), 0);
              }}
              disabled={loadingSummary}
            >
              Refresh
            </button>
          </div>

          {/* Kitchen tab — grouped by session (12:30 / 13:00 / Unassigned) */}
          {loadingSummary ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : summaryError ? (
            <div className="text-sm text-red-600">{summaryError}</div>
          ) : (summary?.byDate?.length ?? 0) > 0 ? (
            <div className="space-y-4">
              {summary!.byDate.map((day) => (
                <div key={day.date} className="border rounded-lg p-2 bg-white shadow-sm">
                  <div className="font-medium mb-2">
                    {new Date(day.date + 'T00:00:00Z').toLocaleDateString()}
                  </div>

                  {(day.sessions ?? []).map((s) => (
                    <div key={s.session ?? 'none'} className="mb-3">
                      <div className="text-sm font-semibold mb-1">
                        Session {s.session ?? 'Unassigned'}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {s.items.map((it) => (
                          <div
                            key={it.itemId}
                            className="flex justify-between rounded border px-2 py-1 bg-white"
                          >
                            <span>{it.name}</span>
                            <span className="font-medium">{it.qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {(!day.sessions || day.sessions.length === 0) && (
                    <div className="text-sm text-gray-500">No items.</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No data yet.</div>
          )}
        </>
      )}
    </div>
  );
}
