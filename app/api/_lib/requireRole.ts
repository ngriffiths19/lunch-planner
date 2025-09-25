// app/api/_lib/requireRole.ts
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function requireRole(roles: Array<'catering' | 'admin'>) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !roles.includes(profile.role as 'catering' | 'admin')) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, userId: user.id };
}
