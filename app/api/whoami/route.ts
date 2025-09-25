// app/api/whoami/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET() {
  const supa = createRouteHandlerClient({ cookies });
  const { data: { user }, error } = await supa.auth.getUser();
  return NextResponse.json({ user, error });
}
