'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Item = { id: string; name: string; active: boolean };

const fmt = (d: Date) => d.toISOString().slice(0,10);
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const endOfMonth   = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0));
const addDays      = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+n));
const getMonOfWeek = (d: Date) => { const dow = d.getUTCDay(); const off = dow===0?-6:1-dow; return addDays(d, off); };

const LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

export default function DailyOptions() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const monthStart = useMemo(()=>startOfMonth(cursor),[cursor]);
  const monthEnd   = useMemo(()=>endOfMonth(cursor),[cursor]);

  const [items, setItems] = useState<Item[]>([]);
  const [allowed, setAllowed] = useState<Record<string, Set<string>>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMsg(null);
    // items
    const ri = await fetch('/api/menu'); const ji = await ri.json();
    if (!ri.ok) throw new Error(ji.error || 'load items failed');
    setItems((ji.items as Item[]).filter(i=>i.active));

    // daily options
    const r = await fetch(`/api/daily-menu?from=${fmt(monthStart)}&to=${fmt(monthEnd)}&locationId=${LOCATION_ID}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'load daily failed');
    const map: Record<string, Set<string>> = {};
    for (const [date, arr] of Object.entries(j.map as Record<string,string[]>)) {
      map[date] = new Set(arr);
    }
    setAllowed(map);
  }, [monthStart, monthEnd]);

  useEffect(() => { void load(); }, [load]);

  const weeks = useMemo(()=>{
    const firstMon = getMonOfWeek(monthStart);
    const lastFri  = addDays(getMonOfWeek(monthEnd), 4);
    const rows: Date[][] = [];
    for (let wk = firstMon; wk <= lastFri; wk = addDays(wk, 7)) {
      rows.push([0,1,2,3,4].map(off => addDays(wk, off)));
    }
    return rows;
  },[monthStart, monthEnd]);

  function toggle(dateKey: string, id: string, on: boolean) {
    setAllowed(prev => {
      const s = new Set(prev[dateKey] ?? []);
      on ? s.add(id) : s.delete(id);
      return { ...prev, [dateKey]: s };
    });
  }

  async function save(dateKey: string) {
    const ids = Array.from(allowed[dateKey] ?? []);
    const r = await fetch('/api/daily-menu', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ date: dateKey, locationId: LOCATION_ID, itemIds: ids })
    });
    if (!r.ok) setMsg(await r.text());
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Daily Options</h1>

      <div className="flex items-center gap-3">
        <button className="border rounded px-3 py-1"
                onClick={()=>setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth()-1, 1)))}>← Prev</button>
        <div className="font-medium">
          {cursor.toLocaleString(undefined,{month:'long',year:'numeric', timeZone:'UTC'})}
        </div>
        <button className="border rounded px-3 py-1"
                onClick={()=>setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth()+1, 1)))}>Next →</button>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="grid gap-3">
        {weeks.map((row, ri)=>(
          <div key={ri} className="grid grid-cols-5 gap-3">
            {row.map(d=>{
              const key = fmt(d);
              const out = d.getUTCMonth() !== cursor.getUTCMonth();
              const sel = allowed[key] ?? new Set<string>();
              return (
                <div key={key} className={`rounded-xl border p-3 ${out?'opacity-40':''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">{d.getUTCDate()}</div>
                    <div className="text-[10px] text-gray-500">{key}</div>
                  </div>

                  <div className="space-y-1 max-h-40 overflow-auto">
                    {items.map(it=>(
                      <label key={it.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox"
                               checked={sel.has(it.id)}
                               onChange={e=>toggle(key, it.id, e.target.checked)} />
                        {it.name}
                      </label>
                    ))}
                    {items.length===0 && <div className="text-xs text-gray-500">No active dishes.</div>}
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button className="border rounded px-2 py-1 text-sm" onClick={()=>void save(key)}>Save</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
