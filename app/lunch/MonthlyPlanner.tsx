'use client';

import { useEffect, useMemo, useState } from 'react';

// TYPES (align with your page.tsx)
type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

// Props
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

  // ----------- Month grid (Mon–Fri only) -----------
  const today = new Date();
  const [monthKey, setMonthKey] = useState<string>(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`; // YYYY-MM
  });

  function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function endOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }
  function fmtIsoLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Compute month bounds + list of weekdays
  const { monthStart, monthEnd, days } = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = endOfMonth(first);
    const list: string[] = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // Sun=0..Sat=6
      if (dow >= 1 && dow <= 5) list.push(fmtIsoLocal(new Date(d)));
    }
    return { monthStart: fmtIsoLocal(first), monthEnd: fmtIsoLocal(last), days: list };
  }, [monthKey]);

  // ----------- Selection state -----------
  // For each date, store one or more itemIds (legacy batch mode supports multi)
  const [selections, setSelections] = useState<Record<string, string[]>>({}); // { 'YYYY-MM-DD': ['itemUuid', ...] }

  function toggleSelection(date: string, itemId: string) {
    setSelections(prev => {
      const cur = new Set(prev[date] ?? []);
      if (cur.has(itemId)) cur.delete(itemId); else cur.add(itemId);
      return { ...prev, [date]: Array.from(cur) };
    });
  }

  // ----------- Kitchen summary for visible month -----------
  const [summary, setSummary] = useState<KitchenSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  async function refreshSummary() {
    setLoadingSummary(true);
    try {
      const s = await getKitchenSummary(monthStart, monthEnd);
      setSummary(s);
    } catch (e) {
      // swallow UI-wise; this is optional
      console.error('Kitchen summary error', e);
    } finally {
      setLoadingSummary(false);
    }
  }
  useEffect(() => { void refreshSummary(); /* eslint-disable-next-line */ }, [monthStart, monthEnd, user.locationId]);

  // ----------- Submit -----------
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleSubmit() {
    setMsg(null);
    setSubmitting(true);
    try {
      // Build legacy batch payload
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
      // Optionally refresh the kitchen summary after save
      void refreshSummary();
    } catch (e: any) {
      // Surface exact server response text
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

  // ----------- UI -----------
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <button
          className="border rounded px-3 py-1"
          onClick={() => {
            const [y, m] = monthKey.split('-').map(Number);
            const prev = new Date(y, m - 2, 1);
            setMonthKey(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
          }}
        >
          ◀ Prev
        </button>
        <div className="font-medium">{monthKey}</div>
        <button
          className="border rounded px-3 py-1"
          onClick={() => {
            const [y, m] = monthKey.split('-').map(Number);
            const next = new Date(y, m, 1);
            setMonthKey(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
          }}
        >
          Next ▶
        </button>
        <div className="ml-auto text-sm text-gray-600">
          {loadingSummary ? 'Loading kitchen…' : summary ? 'Kitchen summary ready' : ''}
        </div>
      </div>

      {/* Very simple list grid (replace with your calendar cells) */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {days.map(date => (
          <div key={date} className="border rounded p-3">
            <div className="font-medium mb-2">{new Date(date).toLocaleDateString()}</div>
            <div className="space-y-1">
              {menu.map(mi => {
                const picked = selections[date]?.includes(mi.id);
                return (
                  <label key={mi.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!picked}
                      onChange={() => toggleSelection(date, mi.id)}
                    />
                    <span>{mi.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

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
    </div>
  );
}
