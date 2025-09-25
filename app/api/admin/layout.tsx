// app/admin/layout.tsx
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Sign in required</h1>
        <p>
          Please <a className="underline" href="/login">sign in</a> to access admin pages.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile?.role as 'staff' | 'catering' | 'admin') ?? 'staff';
  if (role !== 'admin') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Not authorized</h1>
        <p>Admin role required.</p>
      </div>
    );
  }

  return <>{children}</>;
}
