"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { SUPABASE_AUTH_ENABLED } from "./config";
import { getSupabase } from "./supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; email: string | null };

const LOADING: AuthState = { status: "loading" };
// Key used by the removed dev-token login; cleared so old tokens can't sign anyone in.
const LEGACY_DEV_KEY = "qrmenu.devStaffToken";

let state: AuthState = LOADING;
let supaSession: Session | null = null;
let ready = false;
let started = false;
const listeners = new Set<() => void>();

function recompute() {
  if (!ready) state = LOADING;
  else if (supaSession) state = { status: "signedIn", email: supaSession.user.email ?? null };
  else state = { status: "signedOut" };
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  try {
    localStorage.removeItem(LEGACY_DEV_KEY);
  } catch {
    /* storage blocked: nothing to clear */
  }
  const supabase = SUPABASE_AUTH_ENABLED ? getSupabase() : null;
  if (!supabase) {
    ready = true;
    recompute();
    return;
  }
  void supabase.auth.getSession().then(({ data }) => {
    supaSession = data.session;
    ready = true;
    recompute();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    supaSession = session;
    recompute();
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
}

export async function getAccessToken(): Promise<string | null> {
  start();
  const supabase = SUPABASE_AUTH_ENABLED ? getSupabase() : null;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut() {
  const supabase = SUPABASE_AUTH_ENABLED ? getSupabase() : null;
  if (supabase) await supabase.auth.signOut();
  supaSession = null;
  recompute();
}
