'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';

// Types (kept aligned with /lunch/page.tsx)
type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };
type MyDay = { date: string; items: string[] };

// ---- date helpers (LOCAL timezone) ----
function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function ddmmyyyy(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfWeekMonday(d: Date) {
  const copy = new Date(d);
  const dow = copy.getDay(); // Sun=0..Sat=6
  const delta = (dow + 6) % 7; // days since Monday
  copy.setDate(copy.getDate() - delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Props:
 * - menu, user from page
 * - onSubmit: legacy batch payload saver (we build { userId, locationId, month, lines })
 * - getKitchenSummary: already implemented on page
 */
export default function MonthlyPlanner(props: {
  menu: MenuItem[];
  user: User;
  onSubmit: (payload: {
    userId: string;
    locationId: string;
    month: string; // YYYY-MM
    lines: { date: string; itemId: string }[];
  }) => Promise<void>;
  getKitchenSummary: (from: string, to: string) => Promise<KitchenSummary>;
}) {
  const { menu, user, onSubmit, getKitchenSummary } = props;

  // ---------- Month navigation ----------
  const today = new Date();
  const [monthKey, setMonthKey] = useState<string>(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`; // YYYY-MM
  });

  const { firstDay, lastDay, grid } = useMemo(() => {
    // first and last day of chosen month
    const [y, m] = monthKey.split('-').map(Number);
    const first = startOfMonth(new Date(y, m - 1, 1));
    const last = endOfMonth(first);

    // find the Monday that starts the first week row
    const gridStart = startOfWeekMonday(first);
    // we’ll render up to 6 weeks (Mon–Fri only)
    const weeks: { iso: string; inMonth: boolean }[][] = [];
    let cursor = new Date(gridStart);

    for (let w = 0; w < 6; w++) {
      const row: { iso: string; inMonth: boolean }[] = [];
      // Monday..Friday (skip weekends)
      for (let i = 0; i < 5; i++) {
        const d = new Date(cursor); // Mon+offset
        const iso = isoLocal(d);
        const inMonth = d.getMonth() === first.getMonth();
        row.push({ iso, inMonth });
        // advance one day
        cursor.setDate(cursor.getDate() + 1);
      }
      // Skip the weekend quickly
      cursor.setDate(cursor.getDate() + 2);
      // Stop if every cell is beyond last day and not in month
      const allPast = row.every(c => new Date(c.iso) > last && !c.inMonth);
      weeks.push(row);
      if (allPast) break;
    }

    return { firstDay: isoLocal(first), lastDay: isoLocal(last), grid: weeks };
  }, [monthKey]);

  // ---------- Selections (multi-select per day; legacy batch) ----------
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  function toggle(date: string, itemId: string) {
    setSelections(prev => {
      const cur = new Set(prev[date] ?? []);
      if (cur.has(itemId)) cur.delete(itemId);
      else cur.add(itemId);
      return { ...prev, [date]: Array.from(cur) };
    });
  }

  // ---------- Kitchen summary for the visible month ----------
  const [summary, setSummary] = useState<KitchenSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function refreshSummary() {
    setSummaryLoading(true);
    try {
      const s = await getKitchenSummary(firstDay, lastDay);
      setSummary(s);
    } catch (e) {
      console.error('Kitchen summary error', e);
    } finally {
      setSummaryLoading(false);
    }
  }
  useEffect(() => { void refreshSummary(); /* eslint-disable-next-line */ }, [firstDay, lastDay, user.locationId]);

  // ---------- Submit (shows success/error) ----------
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleSubmit() {
    setMsg(null);
    setSubmitting(true);
    try {
      // Build { userId, locationId, month, lines[] }
      const lines: { date: string; itemId: string }[] = [];
      for (const [date, items] of Object.entries(selections)) {
        for (const itemId of items) lines.push({ date, itemId });
      }
      await onSubmit({
        userId: user.id,
        locationId: user.locationId,
        month: monthKey,
        lines,
      });
      setMsg({ kind: 'ok', text: 'Saved!' });
      void refreshSummary();
    } catch (e: any) {
      let text = e?.message || 'Save failed';
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) text = parsed.error;
      } catch {}
      setMsg({ kind: 'error', text });
      console.error('Submit error', e);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- "My week" (Mon–Fri of THIS week, user-only) ----------
  const [mine, setMine] = useState<MyDay[] | null>(null);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);

  const { weekFrom, weekTo, weekFromDisp, weekToDisp } = useMemo(() => {
    const monday = startOfWeekMonday(new Date());
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fromIso = isoLocal(monday);
    const toIso = isoLocal(friday);
    return {
      weekFrom: fromIso, weekTo: toIso,
      weekFromDisp: ddmmyyyy(fromIso),
      weekToDisp: ddmmyyyy(toIso),
    };
  }, []);

  async function loadMyWeek() {
    if (!user?.locationId) {
      setMineError('No location set on your profile.');
      return;
    }
    setMineLoading(true);
    setMineError(null);
    try {
      // Include bearer token to be resilient across domains
      const supa = supabaseBrowser();
      const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token || '';

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

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          className="border rounded px-3 py-1"
          onClick={() => {
            const [y, m] = monthKey.split('-').map(Number);
            const prev = new Date(y, m - 2, 1);
            const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
            setMonthKey(key);
          }}
        >
          ◀ Prev
        </button>

        <div className="font-semibold">
          {monthKey}
        </div>

        <button
          className="border rounded px-3 py-1"
          onClick={() => {
            const [y, m] = monthKey.split('-').map(Number);
            const next = new Date(y, m, 1);
            const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
            setMonthKey(key);
          }}
        >
          Next ▶
        </button>

        <div className="ml-auto text-sm text-gray-600">
          {summaryLoading ? 'Loading kitchen…' : summary ? 'Kitchen summary ready' : ''}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-600">
        <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div>
      </div>

      {/* Calendar grid: rows of Mon..Fri */}
      <div className="grid grid-cols-5 gap-2">
        {grid.map((row, idx) => (
          <FragmentRow key={`w-${idx}`} row={row} menu={menu} selections={selections} toggle={toggle} />
        ))}
      </div>

      {/* Submit */}
      <div className="flex gap-2 items-center">
        <button
          className="border rounded px-4 py-2"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Submit selections'}
        </button>
        {msg && (
          <span className={`text-sm ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {msg.text}
          </span>
        )}
      </div>

      {/* My week */}
      <div className="mt-2 flex items-center gap-2">
        <button className="border rounded px-3 py-2" onClick={() => void loadMyWeek()}>
          My week ({weekFromDisp} → {weekToDisp})
        </button>
        {mineLoading && <span className="text-sm text-gray-500">Loading…</span>}
        {mineError && <span className="text-sm text-red-600">{mineError}</span>}
      </div>

      {mine && (
        <div className="border rounded p-3">
          <div className="font-medium mb-1">Your selections</div>
          {mine.length === 0 ? (
            <div className="text-sm text-gray-500">No selections this week.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {mine.map((d) => (
                <li key={d.date}>
                  <span className="font-semibold">{ddmmyyyy(d.date)}:</span>{' '}
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

/** A row with 5 weekday cells */
function FragmentRow({
  row,
  menu,
  selections,
  toggle,
}: {
  row: { iso: string; inMonth: boolean }[];
  menu: MenuItem[];
  selections: Record<string, string[]>;
  toggle: (date: string, itemId: string) => void;
}) {
  return (
    <>
      {row.map((c) => (
        <div
          key={c.iso}
          className={`border rounded p-2 min-h-32 ${c.inMonth ? '' : 'opacity-40 bg-gray-50'}`}
        >
          <div className="text-xs mb-1 font-medium">{ddmmyyyy(c.iso)}</div>
          <div className="space-y-1">
            {menu.map((mi) => {
              const picked = selections[c.iso]?.includes(mi.id);
              return (
                <label key={mi.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!picked}
                    onChange={() => toggle(c.iso, mi.id)}
                  />
                  <span>{mi.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
