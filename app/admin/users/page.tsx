'use client';

import { useEffect, useMemo, useState } from 'react';

type Role = 'staff' | 'catering' | 'admin';
type Row = { id: string; email: string | null; name: string | null; role: Role | null };

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setMsg(null);
    const r = await fetch('/api/admin/users');
    const j = await r.json();
    if (!r.ok) return setMsg(j.error || 'Failed to load users');
    setRows(j.users as Row[]);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.email ?? '').toLowerCase().includes(s) ||
      (r.name ?? '').toLowerCase().includes(s)
    );
  }, [q, rows]);

  async function updateRole(id: string, role: Role) {
    setBusy(true);
    const r = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    });
    setBusy(false);
    if (!r.ok) {
      const t = await r.text();
      setMsg(t);
      return;
    }
    setRows(prev => prev.map(p => (p.id === id ? { ...p, role } : p)));
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">User Roles</h1>

      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-3 py-2 w-full"
          placeholder="Search by email or name…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="border rounded px-3 py-2" onClick={() => void load()} disabled={busy}>Refresh</button>
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-3 bg-gray-50 text-sm font-semibold px-3 py-2">
          <div>Email</div>
          <div>Name</div>
          <div>Role</div>
        </div>
        {filtered.map(u => (
          <div key={u.id} className="grid grid-cols-3 items-center px-3 py-2 border-t">
            <div className="truncate">{u.email ?? '—'}</div>
            <div className="truncate">{u.name ?? '—'}</div>
            <div>
              <select
                className="border rounded px-2 py-1"
                value={u.role ?? 'staff'}
                onChange={e => updateRole(u.id, e.target.value as Role)}
                disabled={busy}
              >
                <option value="staff">staff</option>
                <option value="catering">catering</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-sm text-gray-500">No users found.</div>
        )}
      </div>
    </div>
  );
}
