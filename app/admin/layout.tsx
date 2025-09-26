// app/admin/layout.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

function isMasterAdmin(email?: string | null) {
  const raw = process.env.MASTER_ADMIN_EMAILS || '';
  return !!email && raw.split(',').map(s => s.trim().toLowerCase()).includes(email.toLowerCase());
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6">Please <a className="underline" href="/login">sign in</a>.</div>;
  }

  if (isMasterAdmin(user.email)) return <>{children}</>;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile?.role as 'staff' | 'catering' | 'admin') ?? 'staff';
  if (role !== 'admin') {
    return <div className="p-6">Not authorized (admin only).</div>;
  }

  return <>{children}</>;
}
