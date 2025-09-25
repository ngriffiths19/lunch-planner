'use client';
import React, { useState } from 'react';
import { supabaseBrowser } from '@/app/lib/supabase-browser';
import { useRouter } from 'next/navigation';

const DEFAULT_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

export default function LoginPage() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [mode, setMode] = useState<'login'|'signup'>('signup');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [lunchSession, setLunchSession] = useState<'12:30'|'13:00'>('12:30');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState<string|null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'signup') {
        const { error } = await sb.auth.signUp({
          email, password,
          options: { data: { name: `${firstName} ${lastName}`.trim() } }
        });
        if (error) throw new Error('Sign up failed: ' + error.message);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Sign in failed: ' + error.message);
      }

      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setMsg('Check your inbox to confirm, then sign in.'); return; }

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          firstName, lastName,
          lunchSession,
          role: 'staff',
          locationId: DEFAULT_LOCATION_ID
        })
      });
      if (!res.ok) throw new Error('Profile upsert failed: ' + await res.text());

      router.replace('/lunch');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setMsg(message || 'Something went wrong');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-md border rounded-2xl p-6 space-y-4">
        <h1 className="text-xl font-semibold">{mode==='signup'?'Create account':'Sign in'}</h1>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode==='signup' && (
            <>
              {/* First/Last: responsive grid (stacks on small, 2 cols from sm:) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="border rounded px-3 py-2 w-full"
                  placeholder="First name"
                  value={firstName}
                  onChange={e=>setFirstName(e.target.value)}
                  required
                />
                <input
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Last name"
                  value={lastName}
                  onChange={e=>setLastName(e.target.value)}
                  required
                />
              </div>

              {/* Lunch session: full width and compact label */}
              <div className="grid grid-cols-1 gap-1">
                <label className="text-sm text-gray-700">Lunch session</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={lunchSession}
                  onChange={e=>setLunchSession(e.target.value as '12:30'|'13:00')}
                >
                  <option value="12:30">12:30 PM</option>
                  <option value="13:00">1:00 PM</option>
                </select>
              </div>
            </>
          )}

          <input
            className="w-full border rounded px-3 py-2"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
          />
          <input
            className="w-full border rounded px-3 py-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            required
          />

          <button className="w-full border rounded-xl py-2" disabled={busy} type="submit">
            {busy ? 'Please wait…' : (mode==='signup'?'Sign up':'Sign in')}
          </button>
        </form>

        <div className="text-sm">
          {mode==='signup'
            ? <>Already have an account? <button className="underline" onClick={()=>setMode('login')}>Sign in</button></>
            : <>New here? <button className="underline" onClick={()=>setMode('signup')}>Create an account</button></>}
        </div>

        {msg && <div className="text-sm text-red-600">{msg}</div>}
      </div>
    </div>
  );
}
