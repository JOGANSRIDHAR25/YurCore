/**
 * Browser-side Supabase client.
 *
 * Uses the public anon key — safe for client components.
 * All RLS policies apply. No admin access.
 */
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/shared/config/env";

export function createClient() {
  return createBrowserClient(
    env.SUPABASE_URL || "https://placeholder.supabase.co",
    env.SUPABASE_ANON_KEY || "placeholder-anon-key"
  );
}
