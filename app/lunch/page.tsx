'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/app/lib/supabase-browser';
import MonthlyPlanner from './MonthlyPlanner';

const DEFAULT_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

// hard-coded sample menu; swap to DB later if you like
const MENU = [
  { id: 'dc74d87b-111f-43cf-ba32-44138519df0c', name: 'Chicken Wrap', active: true },
  { id: 'd2ae293b-c15a-426a-a776-48dd32e49b37', name: 'Veggie Pasta', active: true },
  { id: '08f518b5-d0ee-4481-bce9-e147ce3c6255', name: 'GF Salad', active: true },
];

type Profile = {
  first_name: string | null;
  last_name: string | null;
  lunch_session: '12:30' | '13:00' | null;
};

export default function Page() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load auth user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!mounted) return;
      if (!user) { router.replace('/login'); return; }
      setUserId(user.id);

      // Load profile fields
      const { data, error } = await sb
        .from('profiles')
        .select('first_name, last_name, lunch_session')
        .eq('id', user.id)
        .single();

      if (!mounted) return;
      if (error) {
        // Non-fatal; keep going
        setProfile({ first_name: null, last_name: null, lunch_session: null });
      } else {
        setProfile(data as Profile);
      }

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router, sb]);

  if (loading || !userId) {
    return <div className="p-6 text-sm text-gray-600">Loading…</div>;
  }

  const onSubmit = async (payload: any) => {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert('Save failed: ' + (await res.text()));
    } else {
      alert('Saved!');
    }
  };

  const getKitchenSummary = async (from: string, to: string) => {
    const res = await fetch(`/api/kitchen?from=${from}&to=${to}&locationId=${DEFAULT_LOCATION_ID}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Kitchen fetch failed');
    return j;
  };

  const prettyName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Me';
  const sessionLabel = profile?.lunch_session ?? '—';

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="text-sm text-gray-600 mb-3">
        {prettyName} · Session {sessionLabel}
      </div>

      <MonthlyPlanner
        menu={MENU}
        user={{
          id: userId,
          name: prettyName,
          email: '', // optional
          locationId: DEFAULT_LOCATION_ID
        }}
        onSubmit={onSubmit}
        getKitchenSummary={getKitchenSummary}
      />
    </div>
  );
}
