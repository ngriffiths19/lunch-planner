'use client';

import { useEffect, useMemo, useState } from 'react';

type Item = { id: string; name: string; category: string; active: boolean };
type DayPick = { iso: string; hotId: string | null };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthBounds(year: number, monthIndex0: number) {
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 0);
  return { start, end };
}
function isWeekend(d: Date) {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}
function fmtDDMM(iso: string) {
  const [y,m,d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export default function KitchenOptionsPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11

  const [hotMenu, setHotMenu] = useState<Item[]>([]);
  const [days, setDays] = useState<DayPick[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind:'ok'|'error'; text:string }|null>(null);

  const { start, end } = useMemo(() => monthBounds(viewYear, viewMonth), [viewYear, viewMonth]);
  const fromIso = useMemo(()=> isoLocal(start), [start]);
  const toIso   = useMemo(()=> isoLocal(end),   [end]);

  // Build Mon–Fri days of the month
  const workdayIsos = useMemo(()=>{
    const arr: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      if (!isWeekend(cur)) arr.push(isoLocal(cur));
      cur.setDate(cur.getDate()+1);
    }
    return arr;
  }, [start, end]);

  useEffect(() => {
    (async () => {
      setMsg(null);
      try {
        // Load menu then filter to hot & active
        const rm = await fetch('/api/menu?all=1', { cache:'no-store', credentials:'include' });
        const mj = await rm.json();
        if (!rm.ok) throw new Error(mj.error || 'Failed to load menu');
        const hot = (mj.items as Item[])
          .filter(x => String(x.category) === 'hot' && x.active !== false)
          .sort((a,b)=>a.name.localeCompare(b.name));
        setHotMenu(hot);

        // Load existing month selections from daily-menu
        const rd = await fetch(`/api/daily-menu?from=${fromIso}&to=${toIso}&locationId=${HQ_LOCATION_ID}`, { cache:'no-store', credentials:'include' });
        const dj = await rd.json();
        if (!rd.ok) throw new Error(dj.error || 'Failed to load current month');

        const byIso = new Map<string, string|null>();
        (dj.days ?? []).forEach((d: any) => {
          const list: string[] = Array.isArray(d.itemIds) ? d.itemIds : [];
          byIso.set(d.date, list[0] ?? null); // one hot per day
        });

        setDays(workdayIsos.map(iso => ({ iso, hotId: byIso.get(iso) ?? null })));
      } catch (e:any) {
        setMsg({ kind:'error', text: e?.message || 'Load failed' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromIso, toIso]);

  function setPick(iso: string, hotId: string | null) {
    setDays(prev => prev.map(d => d.iso === iso ? { ...d, hotId } : d));
  }

  async function saveMonth() {
    setSaving(true); setMsg(null);
    try {
      const payload = {
        locationId: HQ_LOCATION_ID,
        from: fromIso,
        to: toIso,
        days: days.map(d => ({ date: d.iso, itemIds: d.hotId ? [d.hotId] : [] })),
      };
      const r = await fetch('/api/daily-menu', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(j.error || 'Save failed');
      setMsg({ kind:'ok', text:'Saved!' });
    } catch(e:any) {
      setMsg({ kind:'error', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  function prevMonth() {
    const d = new Date(viewYear, viewMonth, 1);
    d.setMonth(d.getMonth()-1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(viewYear, viewMonth, 1);
    d.setMonth(d.getMonth()+1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Kitchen › Monthly hot options</h1>
        <div className="flex items-center gap-2">
          <button className="border rounded px-3 py-1" onClick={prevMonth}>← Prev</button>
          <div className="text-sm font-medium">
            {start.toLocaleString(undefined, { month:'long', year:'numeric' })}
          </div>
          <button className="border rounded px-3 py-1" onClick={nextMonth}>Next →</button>
        </div>
      </div>
      <div className="text-sm text-gray-600">Range: {fmtDDMM(fromIso)} → {fmtDDMM(toIso)}</div>
      {msg && <div className={`text-sm ${msg.kind==='ok'?'text-green-700':'text-red-600'}`}>{msg.text}</div>}

      {/* Calendar grid Mon..Fri only */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {days.map(d => (
          <div key={d.iso} className="rounded-xl border p-3 shadow-sm">
            <div className="font-medium mb-2">{fmtDDMM(d.iso)}</div>
            <select
              className="border rounded px-3 py-2 w-full"
              value={d.hotId ?? ''}
              onChange={(e)=> setPick(d.iso, e.target.value || null)}
            >
              <option value="">— No hot option —</option>
              {hotMenu.map(mi => (
                <option key={mi.id} value={mi.id}>{mi.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button className="rounded-lg border px-4 py-2 hover:bg-gray-50" onClick={()=>void saveMonth()} disabled={saving}>
        {saving ? 'Saving…' : 'Save month'}
      </button>
    </div>
  );
}
