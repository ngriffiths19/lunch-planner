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
    const r = await fetch('/api/menu', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error || 'Failed to load menu');
    setItems(j.items as Item[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveNew() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), active: true }),
    });
    setBusy(false);
    if (!r.ok) {
      const t = await r.text();
      setMsg(t);
      return;
    }
    setName('');
    void load();
  }

  async function archive(id: string) {
    if (!confirm('Archive this item? It will be hidden but not deleted.')) return;
    const r = await fetch(`/api/menu?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
    void load();
  }

  async function hardDelete(id: string) {
    if (!confirm('Permanently delete this item? This cannot be undone.')) return;
    const r = await fetch(`/api/menu?id=${encodeURIComponent(id)}&hard=true`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as any));
      alert(j.error || 'Delete failed');
      return;
    }
    void load();
  }

  async function toggleActive(it: Item) {
    const r = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id, name: it.name, active: !it.active }),
    });
    if (!r.ok) {
      setMsg(await r.text());
      return;
    }
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
        <button className="border rounded px-3 py-2" onClick={() => void saveNew()} disabled={busy}>
          Add
        </button>
        <button className="border rounded px-3 py-2" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-4 bg-gray-50 text-sm font-semibold px-3 py-2">
          <div>Name</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
          <div />
        </div>
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-4 items-center px-3 py-2 border-t gap-2">
            <div className="truncate">{it.name}</div>
            <div className={`text-sm ${it.active ? 'text-green-700' : 'text-gray-500'}`}>
              {it.active ? 'Active' : 'Archived'}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="border rounded px-2 py-1 text-sm"
                onClick={() => void toggleActive(it)}
              >
                {it.active ? 'Archive' : 'Activate'}
              </button>
              <button
                className="border rounded px-2 py-1 text-sm"
                onClick={() => void archive(it.id)}
                title="Soft delete (archive)"
              >
                Archive
              </button>
            </div>
            <div className="flex justify-end">
              <button
                className="border rounded px-2 py-1 text-sm"
                onClick={() => void hardDelete(it.id)}
                title="Hard delete (permanent)"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-3 py-6 text-sm text-gray-500">No items yet.</div>
        )}
      </div>
    </div>
  );
}
