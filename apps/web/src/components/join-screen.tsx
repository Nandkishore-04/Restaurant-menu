"use client";

import type { PublicMenu } from "@qrmenu/api-client";
import { useState } from "react";
import { useJoin } from "@/lib/queries";
import { UsersIcon } from "./icons";

export function JoinScreen({ qr, menu }: { qr: string; menu: PublicMenu }) {
  const [name, setName] = useState("");
  const join = useJoin(qr);
  const itemCount = menu.categories.reduce((n, c) => n + (c.items?.length ?? 0), 0);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      {menu.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element -- restaurant-supplied URL
        <img src={menu.logo_url} alt="" className="mb-4 size-16 rounded-2xl object-cover" />
      )}
      <p className="text-sm font-medium text-brand">Welcome to</p>
      <h1 className="text-3xl font-bold tracking-tight">{menu.restaurant_name}</h1>
      <p className="mt-1 text-muted">
        Table {menu.table_label} · {itemCount} dishes on the menu
      </p>

      <div className="mt-8 flex gap-3 rounded-2xl bg-brand-soft p-4 text-sm">
        <UsersIcon className="mt-0.5 shrink-0 text-brand" />
        <p>
          Ordering together? Everyone at your table can scan the same QR code and add to{" "}
          <strong>one shared cart</strong>. No need to pass a phone around.
        </p>
      </div>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) join.mutate(name.trim());
        }}
      >
        <label htmlFor="guest-name" className="text-sm font-medium">
          Your name
        </label>
        <input
          id="guest-name"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="So your table knows who added what"
          className="mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand"
        />
        {join.isError && <p className="mt-2 text-sm text-danger">{join.error.message}</p>}
        <button
          type="submit"
          disabled={!name.trim() || join.isPending}
          className="mt-4 h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-50"
        >
          {join.isPending ? "Joining…" : "See the menu"}
        </button>
      </form>
    </main>
  );
}
