export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true";
export const POLL_MS = REALTIME_ENABLED ? 15_000 : 3_000;

const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** Real staff login via Supabase Auth (needs a running Supabase). */
export const SUPABASE_AUTH_ENABLED = SUPABASE_KEY !== "" && SUPABASE_KEY !== "local-placeholder";

/**
 * Demo mode (client demos only): one-click sign-in as demo staff. The password ships in the
 * browser bundle, so only ever enable this for a deployment holding demo data.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";
export const DEMO_HOME_URL = process.env.NEXT_PUBLIC_DEMO_HOME_URL ?? "";
export const DEMO_ROLES: Record<string, { email: string; label: string; next: string }> = {
  owner: { email: "owner@spiceroute.demo", label: "Owner", next: "/" },
  manager: { email: "manager@spiceroute.demo", label: "Manager", next: "/" },
  waiter: { email: "waiter@spiceroute.demo", label: "Waiter", next: "/" },
  chef: { email: "chef@spiceroute.demo", label: "Kitchen", next: "/" },
  admin: { email: "admin@qrmenu.demo", label: "Platform admin", next: "/platform" },
};
