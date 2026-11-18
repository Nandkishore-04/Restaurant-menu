export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
/** When Supabase Realtime is available, live pushes drive updates and polling is a slow safety net. */
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true";
export const POLL_MS = REALTIME_ENABLED ? 20_000 : 3_000;

/** Demo mode: the home page becomes a launcher for client demos (customer / owner / staff). */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001";
/** "T1=qrtoken,T2=qrtoken": demo tables guests can open from the launcher. */
export const DEMO_TABLES: { label: string; token: string }[] = (process.env.NEXT_PUBLIC_DEMO_TABLES ?? "")
  .split(",")
  .map((pair) => pair.trim().split("="))
  .filter((p) => p.length === 2 && p[0] && p[1])
  .map(([label, token]) => ({ label, token }));
