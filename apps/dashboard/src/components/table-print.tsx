"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { api, unwrap } from "@/lib/api";
import { QrImage } from "./qr-image";
import { useMyRestaurant } from "./restaurant-shell";

/** Printable table-tent cards (4 per A4 page). Always light, whatever the app theme. */
export function TablePrint() {
  const { rid } = useParams<{ rid: string }>();
  const only = useSearchParams().get("table");
  const { restaurant } = useMyRestaurant(rid);
  const tables = useQuery({
    queryKey: ["tables-live", rid],
    queryFn: () =>
      unwrap(api.GET("/v1/restaurants/{restaurant_id}/tables/live", { params: { path: { restaurant_id: rid } } })),
  });
  const list = (tables.data ?? []).filter((t) => t.is_active && (!only || t.id === only));

  return (
    <div className="min-h-dvh bg-[#f6f5f2] text-[#16181d] [color-scheme:light] print:bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-semibold">QR table cards</h1>
          <p className="text-sm text-[#6b6f76]">
            {list.length} card{list.length === 1 ? "" : "s"} · 4 per A4 page · cut along the edges and place one on each table.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!list.length}
          className="h-10 rounded-lg bg-[#1e3a33] px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Print
        </button>
      </div>
      {tables.isPending && <p className="px-6 text-[#6b6f76]">Loading…</p>}
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 px-6 pb-10 sm:grid-cols-2 print:grid-cols-2 print:gap-0 print:p-0">
        {list.map((t) => (
          <section
            key={t.id}
            className="flex aspect-[1/1.32] break-inside-avoid flex-col items-center justify-between rounded-3xl border border-[#e4e1da] bg-white px-8 py-9 text-center print:rounded-none print:border-dashed"
          >
            <div>
              <p className="text-[11px] font-semibold tracking-[0.25em] text-[#9a7542] uppercase">Welcome to</p>
              <p className="mt-1 font-display text-2xl font-semibold">{restaurant?.name}</p>
            </div>
            <div>
              <QrImage value={t.qr_url} size={210} className="mx-auto" />
              <p className="mt-4 text-lg font-semibold">Scan to see the menu &amp; order</p>
              <p className="mt-1 text-sm text-[#6b6f76]">No app needed · Everyone at the table can add to one order</p>
            </div>
            <div className="rounded-2xl bg-[#1e3a33] px-6 py-2 text-white">
              <span className="text-xs tracking-widest uppercase opacity-80">Table</span>
              <p className="font-display text-3xl leading-none font-semibold">{t.label}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
