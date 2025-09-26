'use client';

import { useEffect, useState, useMemo } from 'react';

type Item = { id: string; name: string; category: string; active: boolean };

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'hot', label: 'Hot meals' },
  { key: 'cold_main', label: 'Cold mains' },
  { key: 'cold_side', label: 'Cold sides' },
  { key: 'snack_crisps', label: 'Snack · Crisps' },
  { key: 'snack_fruit', label: 'Snack · Fruit' },
];

export default function KitchenMenuPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch('/api/menu', { cache: 'no-store', credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load menu');
      // Defensive: ensure shape
      const arr = Array.isArray(j.items) ? j.items : [];
      setItems(
        arr
          .map((x: any) => ({
            id: String(x.id),
            name: String(x.name),
            category: String(x.category ?? 'hot'),
            active: Boolean(x.active ?? true),
          }))
          .sort((a: Item, b: Item) => a.name.localeCompare(b.name))
      );
    } catch (e: any) {
      setMsg({ kind: 'error', text: e?.message || 'Failed to load menu' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addItem(name: string, category: string) {
    setMsg(null);
    try {
      const r = await fetch('/api/menu', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Add failed');
      setMsg({ kind: 'ok', text: 'Item added' });
      void load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e?.message || 'Add failed' });
    }
  }

  async function toggleActive(id: string, next: boolean) {
    setMsg(null);
    try {
      const r = await fetch('/api/menu', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active: next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Update failed');
      void load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e?.message || 'Update failed' });
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Kitchen › Menu items</h1>
      {msg && (
        <div className={`text-sm ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}

      <AddForm onAdd={(n, c) => void addItem(n, c)} />

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const list = items.filter((i) => i.category === cat.key);
            return (
              <div key={cat.key} className="rounded-xl border p-3 shadow-sm">
                <div className="font-medium mb-2">{cat.label}</div>
                {list.length === 0 ? (
                  <div className="text-sm text-gray-500">No items</div>
                ) : (
                  <ul className="space-y-1">
                    {list.map((i) => (
                      <li
                        key={i.id}
                        className="flex items-center justify-between rounded px-2 py-1 hover:bg-gray-50"
                      >
                        <span className={`truncate ${i.active ? '' : 'text-gray-400 line-through'}`}>
                          {i.name}
                        </span>
                        <button
                          className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
                          onClick={() => void toggleActive(i.id, !i.active)}
                          title={i.active ? 'Archive' : 'Unarchive'}
                        >
                          {i.active ? 'Archive' : 'Unarchive'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddForm({ onAdd }: { onAdd: (name: string, category: string) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('hot');

  const disabled = useMemo(() => !name.trim(), [name]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New dish name…"
        className="border rounded px-3 py-2 w-64"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="border rounded px-3 py-2"
      >
        <option value="hot">Hot meals</option>
        <option value="cold_main">Cold mains</option>
        <option value="cold_side">Cold sides</option>
        <option value="snack_crisps">Snack · Crisps</option>
        <option value="snack_fruit">Snack · Fruit</option>
      </select>
      <button
        disabled={disabled}
        className={`rounded border px-3 py-2 hover:bg-gray-50 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={() => !disabled && onAdd(name.trim(), category)}
      >
        Add
      </button>
    </div>
  );
}
