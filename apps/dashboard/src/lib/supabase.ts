import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REALTIME_ENABLED, SUPABASE_AUTH_ENABLED } from "./config";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_AUTH_ENABLED && !REALTIME_ENABLED) return null;
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
