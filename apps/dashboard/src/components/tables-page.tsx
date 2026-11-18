"use client";

import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, unwrap } from "@/lib/api";
import { POLL_MS } from "@/lib/config";
import { useLiveChannel } from "@/lib/live";
import { useNow } from "@/lib/use-now";
import { fieldClass, Modal } from "./modal";
import { QrImage } from "./qr-image";
import { useMyRestaurant } from "./restaurant-shell";
import { Badge, btn, errorText, PageHeader, relTime, useFlash } from "./ui";

type LiveTable = Schemas["LiveTable"];

export function TablesPage() {
  const { rid } = useParams<{ rid: string }>();
  const { canEditMenu } = useMyRestaurant(rid);
  const qc = useQueryClient();
  const now = useNow(30_000);
  const [toast, flash] = useFlash();
  const [editing, setEditing] = useState<LiveTable | "new" | null>(null);
  const [showQr, setShowQr] = useState<LiveTable | null>(null);
  const [closing, setClosing] = useState<LiveTable | null>(null);
  useLiveChannel(`restaurant:${rid}`);

  const path = { restaurant_id: rid };
  const key = ["tables-live", rid];
  const tables = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/v1/restaurants/{restaurant_id}/tables/live", { params: { path } })),
    refetchInterval: POLL_MS,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const close = useMutation({
    mutationFn: async (sessionId: string) => {
      const { response } = await api.POST(
        "/v1/restaurants/{restaurant_id}/table-sessions/{session_id}/close",
        { params: { path: { ...path, session_id: sessionId } } },
      );
      if (!response.ok) throw new Error("Could not close the table");
    },
    onSuccess: () => {
      flash(`${closing?.label} is free for the next guests`);
      setClosing(null);
      void refresh();
    },
    onError: (e) => flash(errorText(e), true),
  });

  const list = tables.data ?? [];
  const occupied = list.filter((t) => t.session).length;
  const active = list.filter((t) => t.is_active).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <PageHeader
          title="Tables"
          subtitle={tables.isSuccess ? `${occupied} of ${active} tables occupied · updates live` : " "}
          actions={
            <>
              <Link href={`/r/${rid}/tables/print`} target="_blank" className={`${btn.secondary} inline-flex items-center`}>
                Print QR codes
              </Link>
              {canEditMenu && (
                <button type="button" onClick={() => setEditing("new")} className={btn.primary}>
                  + Table
                </button>
              )}
            </>
          }
        />

        {tables.isPending && <p className="mt-8 text-muted">Loading…</p>}
        {tables.isError && <p className="mt-8 text-danger">{tables.error.message}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              now={now}
              canEdit={canEditMenu}
              onQr={() => setShowQr(t)}
              onEdit={() => setEditing(t)}
              onClose={() => setClosing(t)}
            />
          ))}
        </div>
      </div>

      {editing && (
        <TableEditor
          rid={rid}
          table={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            flash(msg);
            void refresh();
          }}
          onError={(e) => flash(errorText(e), true)}
        />
      )}
      {showQr && (
        <QrDialog
          rid={rid}
          table={showQr}
          canEdit={canEditMenu}
          onClose={() => setShowQr(null)}
          onRotated={(t) => {
            setShowQr(t);
            flash(`New QR code for ${t.label}. Reprint it: the old one no longer works.`);
            void refresh();
          }}
          onError={(e) => flash(errorText(e), true)}
          onCopied={() => flash("Link copied")}
        />
      )}
      {closing?.session && (
        <Modal
          title={`Close ${closing.label}?`}
          onClose={() => setClosing(null)}
          footer={
            <>
              <span className="flex-1" />
              <button type="button" onClick={() => setClosing(null)} className={btn.ghost}>
                Keep open
              </button>
              <button
                type="button"
                disabled={close.isPending}
                onClick={() => close.mutate(closing.session!.id)}
                className={closing.session.due_paise > 0 ? btn.danger : btn.primary}
              >
                Close table
              </button>
            </>
          }
        >
          <p className="text-sm">
            The guests&apos; phones will be signed out of this table and its cart is cleared. Use this when the
            party has left.
          </p>
          {closing.session.due_paise > 0 && (
            <p className="rounded-lg bg-danger/15 px-3 py-2 text-sm font-medium text-danger">
              {formatMoney(closing.session.due_paise)} is still unpaid on this table.
            </p>
          )}
        </Modal>
      )}
      {toast}
    </div>
  );
}

function TableCard({
  table: t,
  now,
  canEdit,
  onQr,
  onEdit,
  onClose,
}: {
  table: LiveTable;
  now: number;
  canEdit: boolean;
  onQr: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const s = t.session;
  const state = !t.is_active
    ? { label: "Inactive", tone: "muted" as const, ring: "border-border opacity-60" }
    : !s
      ? { label: "Free", tone: "ok" as const, ring: "border-border" }
      : s.payment_pending
        ? { label: "Payment pending", tone: "warn" as const, ring: "border-warn/60" }
        : s.order_count > 0 && s.due_paise === 0
          ? { label: "Paid", tone: "ok" as const, ring: "border-ok/50" }
          : { label: "Occupied", tone: "brand" as const, ring: "border-brand/60" };

  return (
    <article className={`flex flex-col rounded-2xl border bg-surface p-4 ${state.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t.label}</h2>
          <p className="text-xs text-muted">{t.seats ? `${t.seats} seats` : "Seats not set"}</p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <div className="mt-4 min-h-16 flex-1 text-sm">
        {s ? (
          <dl className="space-y-1 tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted">Seated</dt>
              <dd>{relTime(s.opened_at, now)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Orders</dt>
              <dd>
                {s.order_count}
                {s.cart_items > 0 && <span className="text-muted"> · {s.cart_items} in cart</span>}
              </dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt className="font-normal text-muted">{s.due_paise > 0 ? "Due" : "Bill"}</dt>
              <dd>{formatMoney(s.due_paise > 0 ? s.due_paise : s.total_paise)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted">{t.is_active ? "Ready for guests." : "Hidden from guests."}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-t border-border pt-3">
        <button type="button" onClick={onQr} className={btn.ghost}>
          QR code
        </button>
        {canEdit && (
          <button type="button" onClick={onEdit} className={btn.ghost}>
            Edit
          </button>
        )}
        {s && (
          <button type="button" onClick={onClose} className={`${btn.ghost} ml-auto font-semibold text-text`}>
            Close table
          </button>
        )}
      </div>
    </article>
  );
}

function TableEditor({
  rid,
  table,
  onClose,
  onSaved,
  onError,
}: {
  rid: string;
  table: LiveTable | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (e: unknown) => void;
}) {
  const [label, setLabel] = useState(table?.label ?? "");
  const [seats, setSeats] = useState(table?.seats ? String(table.seats) : "");
  const [active, setActive] = useState(table?.is_active ?? true);
  const path = { restaurant_id: rid };
  const seatsNum = seats ? Number(seats) : null;
  const valid = label.trim() !== "" && (seatsNum === null || (seatsNum >= 1 && seatsNum <= 100));

  const save = useMutation({
    mutationFn: () =>
      table
        ? unwrap(
            api.PATCH("/v1/restaurants/{restaurant_id}/tables/{table_id}", {
              params: { path: { ...path, table_id: table.id } },
              body: { label: label.trim(), seats: seatsNum, is_active: active },
            }),
          )
        : unwrap(
            api.POST("/v1/restaurants/{restaurant_id}/tables", {
              params: { path },
              body: { label: label.trim(), seats: seatsNum },
            }),
          ),
    onSuccess: (t) => onSaved(table ? `Saved ${t.label}` : `Added ${t.label}`),
    onError,
  });

  return (
    <Modal
      title={table ? `Edit ${table.label}` : "Add a table"}
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button type="button" disabled={!valid || save.isPending} onClick={() => save.mutate()} className={btn.primary}>
            {table ? "Save" : "Add table"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={32} placeholder="T7, Patio 2…" className={fieldClass} autoFocus />
        </label>
        <label className="block text-sm font-medium">
          Seats <span className="font-normal text-muted">(optional)</span>
          <input value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={fieldClass} />
        </label>
      </div>
      {table && (
        <label className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-medium">
          <span>
            Accepting guests
            <span className="block text-xs font-normal text-muted">Turn off to stop its QR code working (e.g. under repair).</span>
          </span>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--ok)]" />
        </label>
      )}
    </Modal>
  );
}

function QrDialog({
  rid,
  table,
  canEdit,
  onClose,
  onRotated,
  onError,
  onCopied,
}: {
  rid: string;
  table: LiveTable;
  canEdit: boolean;
  onClose: () => void;
  onRotated: (t: LiveTable) => void;
  onError: (e: unknown) => void;
  onCopied: () => void;
}) {
  const [confirmRotate, setConfirmRotate] = useState(false);
  const rotate = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/restaurants/{restaurant_id}/tables/{table_id}/rotate-qr", {
          params: { path: { restaurant_id: rid, table_id: table.id } },
        }),
      ),
    onSuccess: (t) => {
      setConfirmRotate(false);
      onRotated({ ...table, qr_token: t.qr_token, qr_url: t.qr_url });
    },
    onError,
  });

  return (
    <Modal
      title={`QR code · ${table.label}`}
      onClose={onClose}
      footer={
        confirmRotate ? (
          <>
            <span className="flex-1 text-sm text-warn">The printed code on the table will stop working.</span>
            <button type="button" onClick={() => setConfirmRotate(false)} className={btn.ghost}>
              Keep
            </button>
            <button type="button" disabled={rotate.isPending} onClick={() => rotate.mutate()} className={btn.danger}>
              New code
            </button>
          </>
        ) : (
          <>
            {canEdit && (
              <button type="button" onClick={() => setConfirmRotate(true)} className={btn.ghost}>
                Replace code…
              </button>
            )}
            <span className="flex-1" />
            <Link href={`/r/${rid}/tables/print?table=${table.id}`} target="_blank" className={`${btn.secondary} inline-flex items-center`}>
              Print card
            </Link>
          </>
        )
      }
    >
      <div className="flex flex-col items-center">
        <div className="rounded-2xl bg-white p-3">
          <QrImage value={table.qr_url} size={220} />
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(table.qr_url);
              onCopied();
            } catch {
              onError(new Error("Couldn't copy the link"));
            }
          }}
          className="mt-4 max-w-full truncate rounded-full bg-surface-2 px-3 py-1.5 font-mono text-xs"
          title="Copy link"
        >
          {table.qr_url}
        </button>
        <p className="mt-3 text-center text-sm text-muted">
          Guests scan this to open {table.label}&apos;s menu. Use &ldquo;Replace code&rdquo; if a photo of it is being
          misused.
        </p>
      </div>
    </Modal>
  );
}
