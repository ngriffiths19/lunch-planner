'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '../../lib/supabase-browser';

type MenuItem = { id: string; name: string; active?: boolean; archived?: boolean; category?: string };
type Day = { iso: string; items: string[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function KitchenMenuPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [days, setDays] = useState<Day[]>([]); // this week Mon..Fri by default
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok'|'error'; text: string }|null>(null);

  // Compute this week Mon..Fri
  const { weekFrom, weekTo } = useMemo(() => {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // 0=Mon
    const mon = new Date(today); mon.setDate(today.getDate() - dow); mon.setHours(0,0,0,0);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    return { weekFrom: isoLocal(mon), weekTo: isoLocal(fri) };
  }, []);

  // Fetch helper always attaching auth
  async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const supa = supabaseBrowser();
    const { data: { session } } = await supa.auth.getSession();
    const token = session?.access_token || '';
    return fetch(input, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  // Load base menu (active + not archived) and any existing daily assignments for the week
  useEffect(() => {
    (async () => {
      setMsg(null);
      try {
        const rm = await authedFetch('/api/menu', { cache: 'no-store' });
        const mj = await rm.json();
        if (!rm.ok) throw new Error(mj.error || 'Failed to load menu');
        const filtered = (mj.items as MenuItem[]).filter(x => x.active !== false && x.archived !== true);
        setMenu(filtered);

        const rd = await authedFetch(`/api/daily-menu?from=${weekFrom}&to=${weekTo}&locationId=${HQ_LOCATION_ID}`, { cache:'no-store' });
        const dj = await rd.json();
        if (!rd.ok) throw new Error(dj.error || 'Failed to load daily menu');
        // Expect dj.days = [{ date:'YYYY-MM-DD', itemIds:[...] }]
        const mapped: Day[] = (dj.days ?? []).map((d: any)=>({ iso: d.date, items: d.itemIds ?? [] }));
        // Fill missing days (Mon..Fri) with empty arrays
        const list: Day[] = [];
        const start = new Date(weekFrom); const end = new Date(weekTo);
        for (let cur=new Date(start); cur<=end; cur.setDate(cur.getDate()+1)) {
          const iso = isoLocal(cur);
          const found = mapped.find(x => x.iso === iso);
          list.push(found ?? { iso, items: [] });
        }
        setDays(list);
      } catch (e:any) {
        setMsg({ kind: 'error', text: e?.message || 'Load failed' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekFrom, weekTo]);

  function toggle(iso: string, itemId: string) {
    setDays(prev => prev.map(d => d.iso !== iso
      ? d
      : { ...d, items: d.items.includes(itemId) ? d.items.filter(x=>x!==itemId) : [...d.items, itemId] }
    ));
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
      const r = await authedFetch('/api/daily-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(j.error || 'Save failed');
      setMsg({ kind: 'ok', text: 'Saved!' });
    } catch (e:any) {
      setMsg({ kind: 'error', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Kitchen &rsaquo; Weekly Menu</h1>
      <div className="text-sm text-gray-600">Week: {weekFrom} → {weekTo}</div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {days.map(d => (
          <div key={d.iso} className="rounded-xl border p-3 shadow-sm">
            <div className="font-medium mb-2">{d.iso}</div>
            <div className="space-y-1 max-h-48 overflow-auto pr-1">
              {menu.map(mi => {
                const picked = d.items.includes(mi.id);
                return (
                  <label key={mi.id}
                    className={`flex items-center gap-2 text-sm rounded px-2 py-1 cursor-pointer ${picked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={picked} onChange={()=>toggle(d.iso, mi.id)} />
                    <span className="truncate">{mi.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-lg border px-4 py-2 hover:bg-gray-50" onClick={()=>void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save week'}
        </button>
        {msg && <span className={`text-sm ${msg.kind==='ok'?'text-green-700':'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
