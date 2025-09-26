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

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yyyymm(iso: string) {
  const [y,m] = iso.split('-'); return `${y}-${m}`;
}
function fmtDDMM(iso: string) {
  const [y,m,d] = iso.split('-'); return `${d}-${m}-${y}`;
}
function monthBounds(year: number, monthIndex0: number) {
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 0);
  return { start, end };
}
function isWeekend(d: Date) { const dow = d.getDay(); return dow === 0 || dow === 6; }

export default function MonthlyPlanner({
  menu,
  user,
  onSubmit,
  getKitchenSummary,
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
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0..11

  // Categorise menu for quick filtering
  const hotItems = useMemo(() => menu.filter(m => m.category === 'hot' && m.active !== false)
                      .sort((a,b)=>a.name.localeCompare(b.name)), [menu]);
  const coldMains = useMemo(() => menu.filter(m => m.category === 'cold_main' && m.active !== false)
                      .sort((a,b)=>a.name.localeCompare(b.name)), [menu]);
  const coldSides = useMemo(() => menu.filter(m => m.category === 'cold_side' && m.active !== false)
                      .sort((a,b)=>a.name.localeCompare(b.name)), [menu]);
  const snacksCrisps = useMemo(() => menu.filter(m => m.category === 'snack_crisps' && m.active !== false)
                      .sort((a,b)=>a.name.localeCompare(b.name)), [menu]);
  const snacksFruit  = useMemo(() => menu.filter(m => m.category === 'snack_fruit' && m.active !== false)
                      .sort((a,b)=>a.name.localeCompare(b.name)), [menu]);

  const snackAll = useMemo(() => [...snacksCrisps, ...snacksFruit].sort((a,b)=>a.name.localeCompare(b.name)), [snacksCrisps, snacksFruit]);

  const { start, end } = useMemo(() => monthBounds(viewYear, viewMonth), [viewYear, viewMonth]);
  const workdayIsos = useMemo(()=>{
    const arr: string[] = []; const cur = new Date(start);
    while (cur <= end) { if (!isWeekend(cur)) arr.push(isoLocal(cur)); cur.setDate(cur.getDate()+1); }
    return arr;
  }, [start, end]);

  // One choice per workday
  const [choices, setChoices] = useState<Record<string, DayChoice>>({});

  // My week (names returned by API)
  const [mine, setMine] = useState<{ date: string; items: string[] }[] | null>(null);
  const [msg, setMsg] = useState<{ kind:'ok'|'error'; text:string }|null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // reset choices when month changes (optional: could fetch existing plan too)
    setChoices(prev => {
      const next: Record<string, DayChoice> = {};
      for (const iso of workdayIsos) next[iso] = prev[iso] ?? { kind:'hot', hotId: null };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdayIsos.join('|')]);

  function setKind(iso: string, kind: 'hot'|'cold') {
    setChoices(prev => {
      const prevDay = prev[iso];
      if (kind === 'hot') return { ...prev, [iso]: { kind:'hot', hotId: prevDay?.kind==='hot' ? prevDay.hotId ?? null : null } };
      return { ...prev, [iso]: { kind:'cold', mainId: null, sideId: null, snackId: null } };
    });
  }
  function setHot(iso: string, id: string | null) {
    setChoices(prev => ({ ...prev, [iso]: { kind:'hot', hotId: id } }));
  }
  function setCold(iso: string, field: 'mainId'|'sideId'|'snackId', id: string | null) {
    setChoices(prev => {
      const cur = prev[iso];
      const base: DayChoice = cur && cur.kind === 'cold' ? cur : { kind:'cold', mainId: null, sideId: null, snackId: null };
      return { ...prev, [iso]: { ...base, [field]: id } as DayChoice };
    });
  }

  async function submitAll() {
    setSaving(true); setMsg(null);
    try {
      // Translate choices -> lines (hot=1 item; cold=3 items)
      const lines: { date: string; itemId: string }[] = [];
      for (const iso of workdayIsos) {
        const c = choices[iso];
        if (!c) continue;
        if (c.kind === 'hot') {
          if (c.hotId) lines.push({ date: iso, itemId: c.hotId });
        } else {
          if (c.mainId && c.sideId && c.snackId) {
            lines.push({ date: iso, itemId: c.mainId });
            lines.push({ date: iso, itemId: c.sideId });
            lines.push({ date: iso, itemId: c.snackId });
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
      setMsg({ kind:'ok', text:'Saved!' });
    } catch (e:any) {
      setMsg({ kind:'error', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function loadMyWeek() {
    setMsg(null); setMine(null);
    try {
      // Compute current week Mon..Fri
      const now = new Date();
      const dow = (now.getDay()+6)%7; const mon = new Date(now); mon.setDate(now.getDate()-dow);
      const fri = new Date(mon); fri.setDate(mon.getDate()+4);
      const from = isoLocal(mon), to = isoLocal(fri);
      const r = await fetch(`/api/plan?from=${from}&to=${to}&locationId=${user.locationId ?? HQ_LOCATION_ID}`, { credentials:'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Load failed');
      // j.days = [{ date, items: [names] }]
      setMine(j.days ?? []);
    } catch (e:any) {
      setMsg({ kind:'error', text: e?.message || 'Load failed' });
    }
  }

  function prevMonth() {
    const d = new Date(viewYear, viewMonth, 1); d.setMonth(d.getMonth()-1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(viewYear, viewMonth, 1); d.setMonth(d.getMonth()+1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Monthly Planner</div>
        <div className="flex items-center gap-2">
          <button className="border rounded px-3 py-1" onClick={prevMonth}>← Prev</button>
          <div className="text-sm font-medium">
            {start.toLocaleString(undefined, { month:'long', year:'numeric' })}
          </div>
          <button className="border rounded px-3 py-1" onClick={nextMonth}>Next →</button>
        </div>
      </div>
      {msg && <div className={`text-sm ${msg.kind==='ok'?'text-green-700':'text-red-600'}`}>{msg.text}</div>}

      {/* Calendar grid Mon..Fri only */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workdayIsos.map(iso => {
          const c = choices[iso] ?? { kind:'hot', hotId: null } as DayChoice;
          return (
            <div key={iso} className="rounded-xl border p-3 shadow-sm">
              <div className="font-medium mb-2">{fmtDDMM(iso)}</div>

              {/* Toggle Hot / Cold */}
              <div className="flex items-center gap-3 mb-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={`kind-${iso}`} checked={c.kind==='hot'} onChange={()=>setKind(iso,'hot')} />
                  Hot
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={`kind-${iso}`} checked={c.kind==='cold'} onChange={()=>setKind(iso,'cold')} />
                  Cold
                </label>
              </div>

              {c.kind === 'hot' ? (
                <select className="border rounded px-3 py-2 w-full" value={c.hotId ?? ''}
                        onChange={(e)=> setHot(iso, e.target.value || null)}>
                  <option value="">— Select hot —</option>
                  {hotItems.map(mi => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                </select>
              ) : (
                <div className="space-y-2">
                  <select className="border rounded px-3 py-2 w-full" value={(c as any).mainId ?? ''}
                          onChange={(e)=> setCold(iso, 'mainId', e.target.value || null)}>
                    <option value="">— Cold main —</option>
                    {coldMains.map(mi => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                  </select>
                  <select className="border rounded px-3 py-2 w-full" value={(c as any).sideId ?? ''}
                          onChange={(e)=> setCold(iso, 'sideId', e.target.value || null)}>
                    <option value="">— Cold side —</option>
                    {coldSides.map(mi => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                  </select>
                  <select className="border rounded px-3 py-2 w-full" value={(c as any).snackId ?? ''}
                          onChange={(e)=> setCold(iso, 'snackId', e.target.value || null)}>
                    <option value="">— Snack (crisps/fruit) —</option>
                    {snackAll.map(mi => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded border px-4 py-2 hover:bg-gray-50" onClick={()=>void submitAll()} disabled={saving}>
          {saving ? 'Saving…' : 'Submit month'}
        </button>
        <button className="rounded border px-3 py-2 hover:bg-gray-50" onClick={()=>void loadMyWeek()}>
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
