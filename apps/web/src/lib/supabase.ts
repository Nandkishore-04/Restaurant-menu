import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REALTIME_ENABLED } from "./config";

let client: SupabaseClient | null = null;

/** Supabase is only used for Realtime here; returns null when realtime is disabled. */
export function getSupabase(): SupabaseClient | null {
  if (!REALTIME_ENABLED) return null;
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
