'use client';

import { useEffect, useState } from 'react';

type Item = { id: string; name: string; active: boolean };

export default function KitchenMenuPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setMsg(null);
    const r = await fetch('/api/menu', { cache: 'no-store', credentials: 'include' });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error || 'Failed to load menu');
    setItems(j.items as Item[]);
  }

  useEffect(() => { void load(); }, []);

  async function addItem() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch('/api/menu', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), active: true }),
    });
    setBusy(false);
    if (!r.ok) return setMsg((await r.json()).error || 'Add failed');
    setName('');
    void load();
  }

  async function archive(id: string) {
    if (!confirm('Archive this item? It will be hidden from the list.')) return;
    const r = await fetch(`/api/menu?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
    });
    if (!r.ok) return setMsg((await r.json()).error || 'Archive failed');
    void load();
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Menu items</h1>

      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="New dish name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="border rounded px-3 py-2" onClick={() => void addItem()} disabled={busy}>
          Add
        </button>
        <button className="border rounded px-3 py-2" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-3 bg-gray-50 text-sm font-semibold px-3 py-2">
          <div>Name</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-3 items-center px-3 py-2 border-t gap-2">
            <div className="truncate">{it.name}</div>
            <div className="text-green-700 text-sm">Active</div>
            <div className="flex justify-end gap-2">
              <button className="border rounded px-2 py-1 text-sm" onClick={() => void archive(it.id)}>
                Archive
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="px-3 py-6 text-sm text-gray-500">No active items.</div>}
      </div>
    </div>
  );
}
