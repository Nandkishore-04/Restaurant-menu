"use client";

import { useSyncExternalStore } from "react";

/** What a guest gets after joining a table; persisted per QR code so reloads keep the session. */
export type GuestSession = {
  token: string;
  guestId: string;
  guestName: string;
  sessionId: string;
  channel: string;
};

const key = (qr: string) => `qrmenu.guest.${qr}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: GuestSession | null }>();

function read(qr: string): GuestSession | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(qr));
  } catch {
    raw = memory.get(qr) ?? null;
  }
  const hit = cache.get(qr);
  if (hit && hit.raw === raw) return hit.value;
  let value: GuestSession | null = null;
  try {
    value = raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    value = null;
  }
  cache.set(qr, { raw, value });
  return value;
}

// Fallback when storage is blocked (private mode): session lasts for this page load.
const memory = new Map<string, string>();

function emit() {
  listeners.forEach((l) => l());
}

export function saveGuestSession(qr: string, session: GuestSession) {
  const raw = JSON.stringify(session);
  try {
    localStorage.setItem(key(qr), raw);
  } catch {
    memory.set(qr, raw);
  }
  emit();
}

export function clearGuestSession(qr: string) {
  try {
    localStorage.removeItem(key(qr));
  } catch {
    /* ignore */
  }
  memory.delete(qr);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGuestSession(qr: string): GuestSession | null {
  return useSyncExternalStore(
    subscribe,
    () => read(qr),
    () => null,
  );
}
