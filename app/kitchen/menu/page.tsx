'use client';
import { useEffect, useState } from 'react';

type Item = { id: string; name: string; active: boolean };

export default function MenuManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string| null>(null);

  async function load() {
    const r = await fetch('/api/menu');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'load failed');
    setItems(j.items as Item[]);
  }

  useEffect(() => { load().catch(e=>setMsg(String(e))); }, []);

  async function addItem() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch('/api/menu', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
    setBusy(false);
    if (!r.ok) return setMsg(await r.text());
    setName(''); load();
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    setBusy(true);
    const r = await fetch('/api/menu', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, ...patch }) });
    setBusy(false);
    if (!r.ok) return setMsg(await r.text());
    load();
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Menu Manager</h1>

      <div className="flex gap-2">
        <input className="border rounded px-3 py-2 flex-1" placeholder="New dish name"
               value={name} onChange={e=>setName(e.target.value)} />
        <button className="border rounded px-3 py-2" onClick={addItem} disabled={busy}>Add</button>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="divide-y border rounded-xl">
        {items.map(it => (
          <div key={it.id} className="p-3 flex items-center gap-3">
            <input
              className="border rounded px-2 py-1 flex-1"
              value={it.name}
              onChange={e => setItems(prev => prev.map(p => p.id===it.id ? {...p, name:e.target.value} : p))}
              onBlur={() => updateItem(it.id, { name: items.find(p=>p.id===it.id)?.name })}
            />
            <label className="text-sm flex items-center gap-1">
              <input type="checkbox" checked={it.active} onChange={e=>updateItem(it.id, { active: e.target.checked })} />
              Active
            </label>
          </div>
        ))}
        {items.length===0 && <div className="p-3 text-sm text-gray-500">No dishes yet.</div>}
      </div>
    </div>
  );
}
