export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true";
export const POLL_MS = REALTIME_ENABLED ? 15_000 : 3_000;

const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** Real staff login via Supabase Auth (needs a running Supabase). */
export const SUPABASE_AUTH_ENABLED = SUPABASE_KEY !== "" && SUPABASE_KEY !== "local-placeholder";
/** Local development only: sign in by pasting a staff token from `scripts.seed_demo`. */
export const DEV_AUTH_ENABLED = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
