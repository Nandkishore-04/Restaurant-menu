export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
/** When Supabase Realtime is available, live pushes drive updates and polling is a slow safety net. */
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true";
export const POLL_MS = REALTIME_ENABLED ? 20_000 : 3_000;
