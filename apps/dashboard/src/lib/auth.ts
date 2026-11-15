"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { SUPABASE_AUTH_ENABLED } from "./config";
import { getSupabase } from "./supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; via: "supabase" | "dev"; email: string | null };

const DEV_KEY = "qrmenu.devStaffToken";
const LOADING: AuthState = { status: "loading" };

let state: AuthState = LOADING;
let devToken: string | null = null;
let supaSession: Session | null = null;
let ready = false;
let started = false;
const listeners = new Set<() => void>();

function recompute() {
  if (!ready) state = LOADING;
  else if (devToken) state = { status: "signedIn", via: "dev", email: null };
  else if (supaSession)
    state = { status: "signedIn", via: "supabase", email: supaSession.user.email ?? null };
  else state = { status: "signedOut" };
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  try {
    devToken = localStorage.getItem(DEV_KEY);
  } catch {
    devToken = null;
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
  if (devToken) return devToken;
  const supabase = SUPABASE_AUTH_ENABLED ? getSupabase() : null;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function signInWithDevToken(token: string) {
  devToken = token.trim();
  try {
    localStorage.setItem(DEV_KEY, devToken);
  } catch {
    /* keep in memory */
  }
  ready = true;
  recompute();
}

export async function signOut() {
  devToken = null;
  try {
    localStorage.removeItem(DEV_KEY);
  } catch {
    /* ignore */
  }
  const supabase = SUPABASE_AUTH_ENABLED ? getSupabase() : null;
  if (supabase) await supabase.auth.signOut();
  supaSession = null;
  recompute();
}
