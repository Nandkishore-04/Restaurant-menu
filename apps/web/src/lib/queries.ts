"use client";

import type { Cart, Order, PublicMenu } from "@qrmenu/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, bearer, unwrap } from "./api";
import { POLL_MS } from "./config";
import { clearGuestSession, saveGuestSession, type GuestSession } from "./guest-session";

/** 401 = token expired/invalid, 410 = staff closed the table. Either way: re-join. */
function handleSessionEnd(qr: string, err: unknown): never {
  if (err instanceof ApiError && (err.status === 401 || err.status === 410)) {
    clearGuestSession(qr);
  }
  throw err;
}

export function useMenu(qr: string) {
  return useQuery<PublicMenu, ApiError>({
    queryKey: ["menu", qr],
    queryFn: () =>
      unwrap(
        api.GET("/v1/public/tables/{qr_token}/menu", { params: { path: { qr_token: qr } } }),
      ),
    refetchInterval: 60_000, // pick up "sold out" changes
    retry: (count, err) => err.status !== 404 && count < 2,
  });
}

export function useJoin(qr: string) {
  return useMutation({
    mutationFn: (guestName: string) =>
      unwrap(
        api.POST("/v1/public/tables/{qr_token}/sessions", {
          params: { path: { qr_token: qr } },
          body: { guest_name: guestName },
        }),
      ),
    onSuccess: (data, guestName) =>
      saveGuestSession(qr, {
        token: data.guest_token,
        guestId: data.guest_id,
        guestName: guestName.trim(),
        sessionId: data.session_id,
        channel: data.realtime_channel,
      }),
  });
}

export function useCart(qr: string, s: GuestSession) {
  return useQuery<Cart, ApiError>({
    queryKey: ["cart", s.sessionId],
    queryFn: () =>
      unwrap(api.GET("/v1/public/session/cart", { headers: bearer(s.token) })).catch((e) =>
        handleSessionEnd(qr, e),
      ),
    refetchInterval: POLL_MS,
  });
}

export function useOrders(qr: string, s: GuestSession) {
  return useQuery<Order[], ApiError>({
    queryKey: ["orders", s.sessionId],
    queryFn: () =>
      unwrap(api.GET("/v1/public/session/orders", { headers: bearer(s.token) })).catch((e) =>
        handleSessionEnd(qr, e),
      ),
    refetchInterval: POLL_MS,
  });
}

export function useCartActions(qr: string, s: GuestSession) {
  const qc = useQueryClient();
  const setCart = (cart: Cart) => qc.setQueryData(["cart", s.sessionId], cart);
  const onError = (e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 410)) clearGuestSession(qr);
  };
  const headers = bearer(s.token);

  const add = useMutation({
    mutationFn: (v: { menuItemId: string; quantity?: number; note?: string | null }) =>
      unwrap(
        api.POST("/v1/public/session/cart/items", {
          headers,
          body: { menu_item_id: v.menuItemId, quantity: v.quantity ?? 1, note: v.note ?? null },
        }),
      ),
    onSuccess: setCart,
    onError,
  });
  const setQty = useMutation({
    mutationFn: (v: { lineId: string; quantity: number }) =>
      unwrap(
        v.quantity <= 0
          ? api.DELETE("/v1/public/session/cart/items/{cart_item_id}", {
              headers,
              params: { path: { cart_item_id: v.lineId } },
            })
          : api.PATCH("/v1/public/session/cart/items/{cart_item_id}", {
              headers,
              params: { path: { cart_item_id: v.lineId } },
              body: { quantity: v.quantity },
            }),
      ),
    onSuccess: setCart,
    onError,
  });
  const placeOrder = useMutation({
    mutationFn: () => unwrap(api.POST("/v1/public/session/orders", { headers })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cart", s.sessionId] });
      void qc.invalidateQueries({ queryKey: ["orders", s.sessionId] });
    },
    onError,
  });
  return { add, setQty, placeOrder };
}
