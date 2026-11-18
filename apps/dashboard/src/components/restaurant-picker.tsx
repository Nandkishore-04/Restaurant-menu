"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, ApiError, unwrap } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { homeFor, useMyRestaurants } from "./restaurant-shell";

export function RestaurantPicker() {
  const router = useRouter();
  const mine = useMyRestaurants();
  const platform = useQuery({
    queryKey: ["platform", "me"],
    queryFn: () => unwrap(api.GET("/v1/platform/me")),
    staleTime: 5 * 60_000,
  });
  const isAdmin = platform.data?.is_platform_admin ?? false;

  // Staff of a single restaurant go straight in; platform admins choose.
  useEffect(() => {
    if (platform.isPending || isAdmin) return;
    if (mine.data?.length === 1) {
      const { restaurant, role } = mine.data[0];
      router.replace(homeFor(restaurant.id, role));
    }
  }, [mine.data, router, isAdmin, platform.isPending]);

  useEffect(() => {
    if (mine.error instanceof ApiError && mine.error.status === 401) void signOut();
  }, [mine.error]);

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Your restaurants</h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-muted underline">
          Sign out
        </button>
      </div>

      {isAdmin && (
        <Link
          href="/platform"
          className="mt-6 flex items-center justify-between rounded-xl border border-brand/50 bg-brand/10 p-4"
        >
          <span>
            <span className="block font-semibold">Platform admin</span>
            <span className="text-sm text-muted">All restaurants, platform numbers, suspend/activate</span>
          </span>
          <span className="text-sm font-semibold text-brand">Open →</span>
        </Link>
      )}

      {mine.isPending && <p className="mt-6 text-muted">Loading…</p>}
      {mine.isError && <p className="mt-6 text-danger">{mine.error.message}</p>}
      {mine.data?.length === 0 && (
        <p className="mt-6 text-muted">
          You&apos;re not part of any restaurant yet. Ask an owner for an invite link.
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {mine.data?.map(({ restaurant, role }) => (
          <li key={restaurant.id}>
            <Link
              href={homeFor(restaurant.id, role)}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-brand"
            >
              <span>
                <span className="block font-semibold">{restaurant.name}</span>
                <span className="text-sm text-muted capitalize">{role}</span>
              </span>
              <span className="text-sm font-medium text-brand">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
