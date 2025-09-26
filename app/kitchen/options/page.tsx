'use client';

import { useEffect, useMemo, useState } from 'react';

type Item = { id: string; name: string; category: string; active: boolean };
type Day = { iso: string; items: string[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function KitchenOptionsPage() {
  const [menu, setMenu] = useState<Item[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [msg, setMsg] = useState<{ kind:'ok'|'error'; text:string }|null>(null);
  const [saving, setSaving] = useState(false);

  // Current week Mon..Fri
  const { weekFrom, weekTo } = useMemo(() => {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // 0=Mon
    const mon = new Date(today); mon.setDate(today.getDate()-dow); mon.setHours(0,0,0,0);
    const fri = new Date(mon); fri.setDate(mon.getDate()+4);
    return { weekFrom: isoLocal(mon), weekTo: isoLocal(fri) };
  }, []);

  // Load base menu and existing daily-menu (but only HOT)
  useEffect(() => {
    (async () => {
      setMsg(null);
      try {
        // All active items, then filter to hot
        const rm = await fetch('/api/menu', { cache:'no-store', credentials:'include' });
        const mj = await rm.json();
        if (!rm.ok) throw new Error(mj.error || 'Failed to load menu');
        const hot = (mj.items as Item[]).filter(x => String(x.category) === 'hot' && x.active !== false);
        setMenu(hot);

        // Load current assignments for the week
        const rd = await fetch(`/api/daily-menu?from=${weekFrom}&to=${weekTo}&locationId=${HQ_LOCATION_ID}`, { cache:'no-store', credentials:'include' });
        const dj = await rd.json();
        if (!rd.ok) throw new Error(dj.error || 'Failed to load week');

        const mapped: Day[] = (dj.days ?? []).map((d: any)=>({ iso: d.date, items: (d.itemIds ?? []).filter(Boolean) }));
        // Fill missing days Mon..Fri
        const list: Day[] = [];
        const start = new Date(weekFrom); const end = new Date(weekTo);
        for (let cur=new Date(start); cur<=end; cur.setDate(cur.getDate()+1)) {
          const iso = isoLocal(cur);
          const found = mapped.find(x => x.iso === iso);
          list.push(found ?? { iso, items: [] });
        }
        setDays(list);
      } catch (e:any) {
        setMsg({ kind:'error', text: e?.message || 'Load failed' });
      }
    })();
  }, [weekFrom, weekTo]);

  function toggle(iso: string, itemId: string) {
    setDays(prev => prev.map(d => d.iso !== iso ? d : (
      d.items.includes(itemId) ? { ...d, items: d.items.filter(x=>x!==itemId) } : { ...d, items: [...d.items, itemId] }
    )));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const payload = {
        locationId: HQ_LOCATION_ID,
        from: weekFrom,
        to: weekTo,
        days: days.map(d => ({ date: d.iso, itemIds: d.items })),
      };
      const r = await fetch('/api/daily-menu', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      setMsg({ kind:'ok', text: 'Saved!' });
    } catch (e:any) {
      setMsg({ kind:'error', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Kitchen › Hot options this week</h1>
      <div className="text-sm text-gray-600">Week: {weekFrom} → {weekTo}</div>
      {msg && <div className={`text-sm ${msg.kind==='ok'?'text-green-700':'text-red-600'}`}>{msg.text}</div>}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {days.map(d => (
          <div key={d.iso} className="rounded-xl border p-3 shadow-sm">
            <div className="font-medium mb-2">{d.iso}</div>
            <div className="space-y-1 max-h-56 overflow-auto pr-1">
              {menu.map(mi => {
                const picked = d.items.includes(mi.id);
                return (
                  <label key={mi.id}
                         className={`flex items-center gap-2 text-sm rounded px-2 py-1 cursor-pointer ${picked?'bg-blue-50 border border-blue-200':'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={picked} onChange={()=>toggle(d.iso, mi.id)} />
                    <span className="truncate">{mi.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button className="rounded-lg border px-4 py-2 hover:bg-gray-50" onClick={()=>void save()} disabled={saving}>
        {saving ? 'Saving…' : 'Save week'}
      </button>
    </div>
  );
}
