"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api, unwrap } from "@/lib/api";
import { signOut } from "@/lib/auth";

export function useMyRestaurant(rid: string) {
  const mine = useQuery({
    queryKey: ["me", "restaurants"],
    queryFn: () => unwrap(api.GET("/v1/me/restaurants")),
    staleTime: 5 * 60_000,
  });
  const entry = mine.data?.find((r) => r.restaurant.id === rid);
  return {
    restaurant: entry?.restaurant,
    role: entry?.role,
    canEditMenu: entry?.role === "owner" || entry?.role === "manager",
    isPending: mine.isPending,
  };
}

/** Header + tabs shared by every screen of one restaurant. */
export function RestaurantShell({ children }: { children: ReactNode }) {
  const { rid } = useParams<{ rid: string }>();
  const pathname = usePathname();
  const { restaurant, canEditMenu } = useMyRestaurant(rid);

  const tabs = [
    { href: `/r/${rid}/kitchen`, label: "Kitchen" },
    ...(canEditMenu ? [{ href: `/r/${rid}/menu`, label: "Menu" }] : []),
  ];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5">
        <div className="flex items-center gap-6">
          <Link href="/" className="py-3 text-muted hover:text-text" aria-label="All restaurants">
            ←
          </Link>
          <p className="py-3 font-bold">{restaurant?.name ?? "…"}</p>
          <nav className="flex gap-1 self-stretch" aria-label="Restaurant sections">
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center border-b-2 px-3 text-sm font-medium ${
                    active ? "border-brand text-text" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button type="button" onClick={() => void signOut()} className="text-sm text-muted hover:text-text">
          Sign out
        </button>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
