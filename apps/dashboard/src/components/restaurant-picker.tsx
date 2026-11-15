"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, ApiError, unwrap } from "@/lib/api";
import { signOut } from "@/lib/auth";

export function RestaurantPicker() {
  const router = useRouter();
  const mine = useQuery({
    queryKey: ["me", "restaurants"],
    queryFn: () => unwrap(api.GET("/v1/me/restaurants")),
  });

  // Single-restaurant staff go straight to their kitchen screen.
  useEffect(() => {
    if (mine.data?.length === 1) router.replace(`/r/${mine.data[0].restaurant.id}/kitchen`);
  }, [mine.data, router]);

  useEffect(() => {
    if (mine.error instanceof ApiError && mine.error.status === 401) void signOut();
  }, [mine.error]);

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your restaurants</h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-muted underline">
          Sign out
        </button>
      </div>
      {mine.isPending && <p className="mt-6 text-muted">Loading…</p>}
      {mine.isError && <p className="mt-6 text-danger">{mine.error.message}</p>}
      {mine.data?.length === 0 && (
        <p className="mt-6 text-muted">You are not a member of any restaurant yet.</p>
      )}
      <ul className="mt-6 space-y-3">
        {mine.data?.map(({ restaurant, role }) => (
          <li key={restaurant.id}>
            <Link
              href={`/r/${restaurant.id}/kitchen`}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-brand"
            >
              <span>
                <span className="block font-semibold">{restaurant.name}</span>
                <span className="text-sm text-muted capitalize">{role}</span>
              </span>
              <span className="text-sm font-medium text-brand">Open kitchen display →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
