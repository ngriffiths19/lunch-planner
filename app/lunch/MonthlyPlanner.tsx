'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';

type MenuItem = { id: string; name: string; active?: boolean; archived?: boolean; category?: string };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };
type MyDay = { date: string; items: string[] };

// ---- date helpers (LOCAL) ----
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const ddmmyyyy = (iso: string) => { const [y,m,day]=iso.split('-'); return `${day}-${m}-${y}`; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0);
function startOfWeekMonday(d: Date) {
  const c = new Date(d); const dow = c.getDay(); const delta=(dow+6)%7;
  c.setDate(c.getDate()-delta); c.setHours(0,0,0,0); return c;
}

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

  // ---------- Month nav ----------
  const now = new Date();
  const [monthKey, setMonthKey] = useState(() => `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);

  const { firstDay, lastDay, weeks } = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number);
    const first = startOfMonth(new Date(y, m-1, 1));
    const last  = endOfMonth(first);
    const gridStart = startOfWeekMonday(first);
    const w: { iso: string; inMonth: boolean }[][] = [];
    let cur = new Date(gridStart);
    for (let row=0; row<6; row++) {
      const cells: { iso: string; inMonth: boolean }[] = [];
      for (let i=0;i<5;i++) { // Mon..Fri
        const d = new Date(cur);
        cells.push({ iso: isoLocal(d), inMonth: d.getMonth()===first.getMonth() });
        cur.setDate(cur.getDate()+1);
      }
      cur.setDate(cur.getDate()+2); // skip weekend
      w.push(cells);
      if (cells.every(c => new Date(c.iso) > last && !c.inMonth)) break;
    }
    return { firstDay: isoLocal(first), lastDay: isoLocal(last), weeks: w };
  }, [monthKey]);

  // ---------- Filtered menu (active + not archived) ----------
  const filteredMenu = useMemo(
    () => (menu ?? []).filter(x => x.active !== false && x.archived !== true),
    [menu]
  );

  // ---------- Selections ----------
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const toggle = (date: string, itemId: string) => setSelections(prev => {
    const cur = new Set(prev[date] ?? []);
    cur.has(itemId) ? cur.delete(itemId) : cur.add(itemId);
    return { ...prev, [date]: Array.from(cur) };
  });

  // ---------- Kitchen summary ----------
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<KitchenSummary | null>(null);
  async function refreshSummary() {
    setSummaryLoading(true);
    try { setSummary(await getKitchenSummary(firstDay, lastDay)); }
    catch (e) { console.error(e); }
    finally { setSummaryLoading(false); }
  }
  useEffect(() => { void refreshSummary(); /* eslint-disable-next-line */ }, [firstDay, lastDay, user.locationId]);

  // ---------- Submit ----------
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  async function handleSubmit() {
    setMsg(null); setSubmitting(true);
    try {
      const lines: { date: string; itemId: string }[] = [];
      for (const [date, ids] of Object.entries(selections)) for (const id of ids) lines.push({ date, itemId: id });
      await onSubmit({ userId: user.id, locationId: user.locationId, month: monthKey, lines });
      setMsg({ kind: 'ok', text: 'Saved!' }); void refreshSummary();
    } catch (e: any) {
      let text = e?.message || 'Save failed'; try { const j = JSON.parse(text); if (j?.error) text = j.error; } catch {}
      setMsg({ kind: 'error', text });
    } finally { setSubmitting(false); }
  }

  // ---------- My week ----------
  const [mine, setMine] = useState<MyDay[] | null>(null);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);
  const { weekFrom, weekTo, weekFromDisp, weekToDisp } = useMemo(() => {
    const mon = startOfWeekMonday(new Date()); const fri = new Date(mon); fri.setDate(mon.getDate()+4);
    const f = isoLocal(mon), t = isoLocal(fri); return { weekFrom:f, weekTo:t, weekFromDisp:ddmmyyyy(f), weekToDisp:ddmmyyyy(t) };
  }, []);
  async function loadMyWeek() {
    setMineError(null); setMineLoading(true);
    try {
      const supa = supabaseBrowser(); const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token || '';
      const r = await fetch(`/api/plan?from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(weekTo)}&locationId=${encodeURIComponent(user.locationId)}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Failed to load');
      setMine(j.days as MyDay[]);
    } catch (e:any) { setMineError(e?.message || 'Failed to load'); }
    finally { setMineLoading(false); }
  }

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-lg border px-3 py-1 hover:bg-gray-50" onClick={()=>{
          const [y,m]=monthKey.split('-').map(Number); const prev=new Date(y,m-2,1);
          setMonthKey(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`);
        }}>◀ Prev</button>

        <div className="text-lg font-semibold tracking-wide">{monthKey}</div>

        <button className="rounded-lg border px-3 py-1 hover:bg-gray-50" onClick={()=>{
          const [y,m]=monthKey.split('-').map(Number); const next=new Date(y,m,1);
          setMonthKey(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);
        }}>Next ▶</button>

        <div className="ml-auto text-sm text-gray-600">
          {summaryLoading ? 'Loading kitchen…' : summary ? 'Kitchen summary ready' : ''}
        </div>
      </div>

      {/* Headers */}
      <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-gray-600">
        <div className="px-2">Mon</div><div className="px-2">Tue</div><div className="px-2">Wed</div><div className="px-2">Thu</div><div className="px-2">Fri</div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-5 gap-2">
        {weeks.map((row, i) => (
          <div key={`row-${i}`} className="contents">
            {row.map(cell => {
              const items = filteredMenu;
              return (
                <div key={cell.iso}
                  className={`rounded-xl border p-2 min-h-36 shadow-sm ${cell.inMonth ? 'bg-white' : 'bg-gray-50 opacity-60'} hover:shadow-md transition`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium">{ddmmyyyy(cell.iso)}</span>
                    {/* selection count pill */}
                    <span className="text-[10px] rounded-full px-2 py-0.5 border">
                      {selections[cell.iso]?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-auto pr-1">
                    {items.map(mi => {
                      const picked = selections[cell.iso]?.includes(mi.id);
                      return (
                        <label key={mi.id}
                          className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1 cursor-pointer ${picked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                        >
                          <input type="checkbox" checked={!!picked} onChange={()=>toggle(cell.iso, mi.id)} />
                          <span className="truncate">{mi.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button className="rounded-lg border px-4 py-2 font-medium hover:bg-gray-50" onClick={()=>void handleSubmit()} disabled={submitting}>
          {submitting ? 'Saving…' : 'Submit selections'}
        </button>
        {msg && <span className={`text-sm ${msg.kind==='ok'?'text-green-700':'text-red-600'}`}>{msg.text}</span>}
      </div>

      {/* My week */}
      <div className="mt-1 flex items-center gap-2">
        <button className="rounded-lg border px-3 py-2 hover:bg-gray-50" onClick={()=>void loadMyWeek()}>
          My week ({ddmmyyyy(weekFrom)} → {ddmmyyyy(weekTo)})
        </button>
        {mineLoading && <span className="text-sm text-gray-500">Loading…</span>}
        {mineError && <span className="text-sm text-red-600">{mineError}</span>}
      </div>
      {mine && (
        <div className="rounded-xl border p-3">
          <div className="font-medium mb-1">Your selections</div>
          {mine.length===0 ? <div className="text-sm text-gray-500">No selections this week.</div> : (
            <ul className="text-sm space-y-1">
              {mine.map(d => (
                <li key={d.date}><span className="font-semibold">{ddmmyyyy(d.date)}:</span> {d.items.join(', ')}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
