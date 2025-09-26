'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';

type Cat = 'hot'|'cold_main'|'cold_side'|'cold_extra';
type Item = { id: string; name: string; active: boolean; category: Cat };

export default function KitchenMenuPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [newCat, setNewCat] = useState<Cat>('hot');
  const [editing, setEditing] = useState<Record<string, { name: string; category: Cat }>>({});
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function load() {
    const r = await fetch('/api/menu', { cache: 'no-store', credentials: 'include' });
    const j = await r.json();
    if (!r.ok) { push({ text: j.error || 'Failed to load', kind: 'error' }); return; }
    setItems(j.items as Item[]);
  }
  useEffect(() => { void load(); }, []);

  async function addItem() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch('/api/menu', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), active: true, category: newCat }),
    });
    setBusy(false);
    if (!r.ok) { push({ text: (await r.json()).error || 'Add failed', kind: 'error' }); return; }
    setName(''); push({ text: 'Added' }); void load();
  }

  async function archive(id: string) {
    if (!window.confirm('Archive this item? It will be hidden from the list.')) return;
    const r = await fetch(`/api/menu?id=${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'include' });
    if (!r.ok) { push({ text: (await r.json()).error || 'Archive failed', kind:'error' }); return; }
    push({ text: 'Archived' }); void load();
  }

  function startEdit(it: Item) {
    setEditing(e => ({ ...e, [it.id]: { name: it.name, category: it.category } }));
  }
  function cancelEdit(id: string) {
    setEditing(e => { const n={...e}; delete n[id]; return n; });
  }
  async function saveEdit(id: string) {
    const edit = editing[id];
    if (!edit) return;
    const r = await fetch('/api/menu', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: edit.name.trim(), category: edit.category }),
    });
    if (!r.ok) { push({ text: (await r.json()).error || 'Rename failed', kind:'error' }); return; }
    push({ text: 'Saved' }); cancelEdit(id); void load();
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Menu items</h1>

      <div className="flex gap-2 flex-wrap">
        <input className="border rounded px-3 py-2 flex-1 min-w-[240px]" placeholder="New dish name…"
               value={name} onChange={e=>setName(e.target.value)} />
        <select className="border rounded px-2 py-2" value={newCat} onChange={(e)=>setNewCat(e.target.value as Cat)}>
          <option value="hot">Hot</option>
          <option value="cold_main">Cold • Main</option>
          <option value="cold_side">Cold • Side</option>
          <option value="cold_extra">Cold • Crisps/Fruit</option>
        </select>
        <button className="border rounded px-3 py-2" onClick={()=>void addItem()} disabled={busy}>Add</button>
        <button className="border rounded px-3 py-2" onClick={()=>void load()}>Refresh</button>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-4 bg-gray-50 text-sm font-semibold px-3 py-2">
          <div>Name</div><div>Category</div><div>Status</div><div className="text-right">Actions</div>
        </div>
        {items.map(it => {
          const ed = editing[it.id];
          return (
            <div key={it.id} className="grid grid-cols-4 items-center px-3 py-2 border-t gap-2">
              <div>
                {ed ? (
                  <input className="border rounded px-2 py-1 w-full"
                         value={ed.name} onChange={e=>setEditing(s=>({ ...s, [it.id]: { ...ed, name: e.target.value } }))}/>
                ) : (
                  <div className="truncate">{it.name}</div>
                )}
              </div>
              <div>
                {ed ? (
                  <select className="border rounded px-2 py-1"
                          value={ed.category}
                          onChange={e=>setEditing(s=>({ ...s, [it.id]: { ...ed, category: e.target.value as Cat } }))}>
                    <option value="hot">Hot</option>
                    <option value="cold_main">Cold • Main</option>
                    <option value="cold_side">Cold • Side</option>
                    <option value="cold_extra">Cold • Crisps/Fruit</option>
                  </select>
                ) : (
                  <span className="text-sm">{it.category}</span>
                )}
              </div>
              <div className="text-green-700 text-sm">Active</div>
              <div className="flex justify-end gap-2">
                {ed ? (
                  <>
                    <button className="border rounded px-2 py-1 text-sm" onClick={()=>void saveEdit(it.id)}>Save</button>
                    <button className="border rounded px-2 py-1 text-sm" onClick={()=>cancelEdit(it.id)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="border rounded px-2 py-1 text-sm" onClick={()=>startEdit(it)}>Edit</button>
                    <button className="border rounded px-2 py-1 text-sm" onClick={()=>void archive(it.id)}>Archive</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <div className="px-3 py-6 text-sm text-gray-500">No active items.</div>}
      </div>
    </div>
  );
}
