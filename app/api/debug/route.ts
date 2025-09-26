export const dynamic = 'force-dynamic'; export const revalidate = 0;
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { supabaseService } from '../../lib/supabase';

export async function GET() {
  const serverUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projRef = serverUrl?.match(/https:\/\/(.+)\.supabase\.co/)?.[1] ?? null;

  const supa = createRouteHandlerClient({ cookies });
  const { data: { user: cookieUser } } = await supa.auth.getUser();

  const svc = supabaseService();

  // Try bearer user if present
  let bearerUser: any = null;
  // We can’t read the Authorization header in a GET easily here, so just show cookie user for now.

  return NextResponse.json({
    projectRef: projRef,
    serverUrl,
    cookieUser: cookieUser ? { id: cookieUser.id, email: (cookieUser as any).email } : null,
  });
}
