'use client';

import { useEffect, useMemo, useState } from 'react';

type MenuItem = { id: string; name: string; category: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };

type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

type DayChoice =
  | { kind: 'hot'; hotId: string | null }
  | { kind: 'cold'; mainId: string | null; sideId: string | null; snackId: string | null };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

/* ---------- helpers ---------- */
function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtDDMM(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function yyyymm(iso: string) {
  const [y, m] = iso.split('-');
  return `${y}-${m}`;
}
function mondayOf(d: Date) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Mon
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function monthBounds(year: number, monthIndex0: number) {
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 0);
  return { start, end };
}
function buildMonthWeeks(year: number, monthIndex0: number) {
  const { start, end } = monthBounds(year, monthIndex0);
  const cur = mondayOf(start);
  const lastIso = isoLocal(end);
  const weeks: (string | null)[][] = [];
  while (true) {
    const row: (string | null)[] = [];
    const rowStart = new Date(cur);
    for (let i = 0; i < 5; i++) {
      const d = new Date(rowStart);
      d.setDate(rowStart.getDate() + i);
      const iso = isoLocal(d);
      row.push(d.getMonth() === monthIndex0 ? iso : null);
    }
    weeks.push(row);
    cur.setDate(cur.getDate() + 7);
    if (isoLocal(cur) > lastIso && cur.getDay() === 1) break;
  }
  return weeks;
}
// read Supabase auth cookie → access token
function getSupabaseAccessToken(): string | null {
  const m = document.cookie.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (!m) return null;
  try {
    const raw = decodeURIComponent(m[1]);
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch {
    return null;
  }
}

/* ---------- component ---------- */
export default function MonthlyPlanner({
  menu,
  user,
  onSubmit,
  getKitchenSummary, // kept for parity
}: {
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
  // categories
  const hotItems = useMemo(
    () => menu.filter(m => m.category === 'hot' && m.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [menu],
  );
  const coldMains = useMemo(
    () => menu.filter(m => m.category === 'cold_main' && m.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [menu],
  );
  const coldSides = useMemo(
    () => menu.filter(m => m.category === 'cold_side' && m.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [menu],
  );
  const snacksCrisps = useMemo(
    () => menu.filter(m => m.category === 'snack_crisps' && m.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [menu],
  );
  const snacksFruit = useMemo(
    () => menu.filter(m => m.category === 'snack_fruit' && m.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [menu],
  );
  const snackAll = useMemo(
    () => [...snacksCrisps, ...snacksFruit].sort((a, b) => a.name.localeCompare(b.name)),
    [snacksCrisps, snacksFruit],
  );

  // month nav
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const weeks = useMemo(() => buildMonthWeeks(viewYear, viewMonth), [viewYear, viewMonth]);
  const workdayIsos = useMemo(() => weeks.flat().filter((x): x is string => !!x), [weeks]);

  // choices
  const [choices, setChoices] = useState<Record<string, DayChoice>>({});
  useEffect(() => {
    setChoices(prev => {
      const next: Record<string, DayChoice> = {};
      for (const iso of workdayIsos) next[iso] = prev[iso] ?? { kind: 'hot', hotId: null };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdayIsos.join('|')]);

  function setKind(iso: string, kind: 'hot' | 'cold') {
    setChoices(prev => {
      const prevDay = prev[iso];
      if (kind === 'hot') return { ...prev, [iso]: { kind: 'hot', hotId: prevDay?.kind === 'hot' ? prevDay.hotId ?? null : null } };
      return { ...prev, [iso]: { kind: 'cold', mainId: null, sideId: null, snackId: null } };
    });
  }
  function setHot(iso: string, id: string | null) {
    setChoices(prev => ({ ...prev, [iso]: { kind: 'hot', hotId: id } }));
  }
  function setCold(iso: string, field: 'mainId' | 'sideId' | 'snackId', id: string | null) {
    setChoices(prev => {
      const cur = prev[iso];
      const base: DayChoice = cur && cur.kind === 'cold' ? cur : { kind: 'cold', mainId: null, sideId: null, snackId: null };
      return { ...prev, [iso]: { ...base, [field]: id } as DayChoice };
    });
  }

  // submit month
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function submitMonth() {
    setSaving(true);
    setMsg(null);
    try {
      const lines: { date: string; itemId: string }[] = [];
      for (const iso of workdayIsos) {
        const c = choices[iso];
        if (!c) continue;
        if (c.kind === 'hot') {
          if (c.hotId) lines.push({ date: iso, itemId: c.hotId });
        } else {
          const cc = c as any;
          if (cc.mainId && cc.sideId && cc.snackId) {
            lines.push({ date: iso, itemId: cc.mainId! });
            lines.push({ date: iso, itemId: cc.sideId! });
            lines.push({ date: iso, itemId: cc.snackId! });
          }
        }
      }
      const month = yyyymm(workdayIsos[0] ?? isoLocal(new Date()));
      await onSubmit({
        userId: user.id,
        locationId: user.locationId ?? HQ_LOCATION_ID,
        month,
        lines,
      });
      setMsg({ kind: 'ok', text: 'Saved!' });
    } catch (e: any) {
      setMsg({ kind: 'error', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  // My Week (current week Mon–Fri) WITH BEARER TOKEN
  const [mine, setMine] = useState<{ date: string; items: string[] }[] | null>(null);
  async function loadMyWeek() {
    setMsg(null);
    setMine(null);
    try {
      const mon = mondayOf(new Date());
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);
      const from = isoLocal(mon);
      const to = isoLocal(fri);

      const token = getSupabaseAccessToken();
      const r = await fetch(
        `/api/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&locationId=${encodeURIComponent(
          user.locationId ?? HQ_LOCATION_ID,
        )}`,
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Load failed');

      // normalise to names regardless of shape
      const nameById = new Map(menu.map(m => [m.id, m.name]));
      const days = (j.days ?? []).map((d: any) => {
        const arr: any[] = Array.isArray(d.items) ? d.items : [];
        const names = arr
          .map(x => {
            if (typeof x === 'string') return nameById.get(x) ?? x;
            if (x && typeof x === 'object') return x.name ?? nameById.get(x.id) ?? '';
            return '';
          })
          .filter(Boolean);
        return { date: d.date, items: names };
      });

      setMine(days);
    } catch (e: any) {
      setMsg({ kind: 'error', text: e?.message || 'Load failed' });
    }
  }

  function prevMonth() {
    const d = new Date(viewYear, viewMonth, 1);
    d.setMonth(d.getMonth() - 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(viewYear, viewMonth, 1);
    d.setMonth(d.getMonth() + 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  /* ---------- render ---------- */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Monthly Planner</div>
        <div className="flex items-center gap-2">
          <button className="border rounded px-3 py-1" onClick={prevMonth}>← Prev</button>
          <div className="text-sm font-medium">
            {new Date(viewYear, viewMonth, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <button className="border rounded px-3 py-1" onClick={nextMonth}>Next →</button>
        </div>
      </div>

      {msg && <div className={`text-sm ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</div>}

      {/* === weekday header (Mon–Fri) === */}
      <div className="hidden md:grid grid-cols-5 gap-3 text-xs uppercase tracking-wide text-gray-500">
        <div>Monday</div>
        <div>Tuesday</div>
        <div>Wednesday</div>
        <div>Thursday</div>
        <div>Friday</div>
      </div>

      {/* Month grid: each row is a week; five columns for Mon..Fri */}
      <div className="space-y-3">
        {weeks.map((row, wIdx) => (
          <div key={wIdx} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {row.map((iso, idx) => {
              if (!iso) return <div key={idx} className="rounded-xl border p-3 opacity-40 bg-gray-50" />;
              const c = choices[iso] ?? ({ kind: 'hot', hotId: null } as DayChoice);
              return (
                <div key={iso} className="rounded-xl border p-3 shadow-sm">
                  <div className="font-medium mb-2">{fmtDDMM(iso)}</div>

                  <div className="flex items-center gap-3 mb-2 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name={`kind-${iso}`} checked={c.kind === 'hot'} onChange={() => setKind(iso, 'hot')} />
                      Hot
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name={`kind-${iso}`} checked={c.kind === 'cold'} onChange={() => setKind(iso, 'cold')} />
                      Cold
                    </label>
                  </div>

                  {c.kind === 'hot' ? (
                    <select className="border rounded px-3 py-2 w-full" value={c.hotId ?? ''} onChange={e => setHot(iso, e.target.value || null)}>
                      <option value="">— Select hot —</option>
                      {hotItems.map(mi => (
                        <option key={mi.id} value={mi.id}>
                          {mi.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <select className="border rounded px-3 py-2 w-full" value={(c as any).mainId ?? ''} onChange={e => setCold(iso, 'mainId', e.target.value || null)}>
                        <option value="">— Cold main —</option>
                        {coldMains.map(mi => (
                          <option key={mi.id} value={mi.id}>
                            {mi.name}
                          </option>
                        ))}
                      </select>
                      <select className="border rounded px-3 py-2 w-full" value={(c as any).sideId ?? ''} onChange={e => setCold(iso, 'sideId', e.target.value || null)}>
                        <option value="">— Cold side —</option>
                        {coldSides.map(mi => (
                          <option key={mi.id} value={mi.id}>
                            {mi.name}
                          </option>
                        ))}
                      </select>
                      <select className="border rounded px-3 py-2 w-full" value={(c as any).snackId ?? ''} onChange={e => setCold(iso, 'snackId', e.target.value || null)}>
                        <option value="">— Snack (crisps/fruit) —</option>
                        {snackAll.map(mi => (
                          <option key={mi.id} value={mi.id}>
                            {mi.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded border px-4 py-2 hover:bg-gray-50" onClick={() => void submitMonth()} disabled={saving}>
          {saving ? 'Saving…' : 'Submit month'}
        </button>
        <button className="rounded border px-3 py-2 hover:bg-gray-50" onClick={() => void loadMyWeek()}>
          My week
        </button>
      </div>

      {mine && (
        <div className="mt-3 border rounded p-3">
          <div className="font-medium mb-1">Your selections</div>
          <ul className="text-sm space-y-1">
            {mine.map(d => (
              <li key={d.date}>
                <span className="font-semibold">{fmtDDMM(d.date)}:</span> {d.items.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
