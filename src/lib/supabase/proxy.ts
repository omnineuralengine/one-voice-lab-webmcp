import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { ensureOneLabSessionCookie } from "@/lib/access/session-cookie";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function refreshOneSupabaseSession(request: NextRequest) {
  const config = getPublicSupabaseConfig();
  const sessionResponse = NextResponse.next();
  ensureOneLabSessionCookie(request, sessionResponse);
  let response = NextResponse.next({ request });
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  if (config) {
    const client = createServerClient(config.url, config.publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headersToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });

    await client.auth.getClaims();
  }
  return response;
}
