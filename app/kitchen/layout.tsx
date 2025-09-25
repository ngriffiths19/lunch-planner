// app/kitchen/layout.tsx
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export default async function KitchenLayout({ children }: { children: ReactNode }) {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Sign in required</h1>
        <p>
          Please <a className="underline" href="/login">sign in</a> to access the kitchen tools.
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
  const allowed = role === 'catering' || role === 'admin';

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Not authorized</h1>
        <p>
          Your account does not have access to the kitchen tools. Ask an admin to grant the{' '}
          <code>catering</code> role.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
