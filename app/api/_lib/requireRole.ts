import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseService } from '../../lib/supabase';

function isMasterAdmin(email: string | null | undefined) {
  const raw = process.env.MASTER_ADMIN_EMAILS || '';
  return !!email && raw.split(',').map(s => s.trim().toLowerCase()).includes(email.toLowerCase());
}

/**
 * Use cookie auth ONLY to identify the user,
 * then read role via SERVICE client (bypasses RLS) to be robust.
 */
export async function requireRole(
  roles: Array<'catering' | 'admin'>
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  // who is the caller?
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  // master-admin bypass
  if (isMasterAdmin(user.email)) {
    // ensure profile exists and is admin
    await supabaseService()
      .from('profiles')
      .upsert({ id: user.id, role: 'admin' }, { onConflict: 'id' });
    return { ok: true, userId: user.id };
  }

  // robust role lookup (service client)
  const svc = supabaseService();
  const { data: profile } = await svc
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as 'staff' | 'catering' | 'admin') ?? 'staff';

  // ✅ Narrow before .includes to satisfy TS
  const allowed =
    (role === 'admin' && roles.includes('admin')) ||
    (role === 'catering' && roles.includes('catering'));

  if (!allowed) return { ok: false, status: 403 };

  return { ok: true, userId: user.id };
}
