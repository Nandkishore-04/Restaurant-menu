"use client";

import type { Schemas } from "@qrmenu/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, unwrap } from "@/lib/api";
import { useNow } from "@/lib/use-now";
import { fieldClass, Modal } from "./modal";
import { useMyRestaurant } from "./restaurant-shell";
import { Badge, btn, Card, errorText, PageHeader, relTime, useFlash } from "./ui";

type Role = Schemas["MemberRole"];
type Invite = Schemas["InviteOut"];

export const ROLES: { role: Role; label: string; can: string }[] = [
  { role: "owner", label: "Owner", can: "Everything, including staff and settings" },
  { role: "manager", label: "Manager", can: "Menu, tables, payments, orders, settings" },
  { role: "staff", label: "Waiter / floor", can: "Tables, orders and payments" },
  { role: "kitchen", label: "Kitchen", can: "Kitchen display only" },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.role === r)?.label ?? r;
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function StaffPage() {
  const { rid } = useParams<{ rid: string }>();
  const { isOwner, restaurant } = useMyRestaurant(rid);
  const qc = useQueryClient();
  const now = useNow(60_000);
  const [toast, flash] = useFlash();
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState<Invite | null>(null);
  const [removing, setRemoving] = useState<Schemas["MemberOut"] | null>(null);
  const path = { restaurant_id: rid };

  const members = useQuery({
    queryKey: ["members", rid],
    queryFn: () => unwrap(api.GET("/v1/restaurants/{restaurant_id}/members", { params: { path } })),
  });
  const invites = useQuery({
    queryKey: ["invites", rid],
    queryFn: () => unwrap(api.GET("/v1/restaurants/{restaurant_id}/invites", { params: { path } })),
    enabled: isOwner,
  });

  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: Role }) =>
      unwrap(
        api.PATCH("/v1/restaurants/{restaurant_id}/members/{member_id}", {
          params: { path: { ...path, member_id: v.id } },
          body: { role: v.role },
        }),
      ),
    onSuccess: (m) => {
      flash(`${m.email ?? "Member"} is now ${roleLabel(m.role)}`);
      void qc.invalidateQueries({ queryKey: ["members", rid] });
    },
    onError: (e) => {
      flash(errorText(e), true);
      void qc.invalidateQueries({ queryKey: ["members", rid] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { response, error } = await api.DELETE("/v1/restaurants/{restaurant_id}/members/{member_id}", {
        params: { path: { ...path, member_id: id } },
      });
      if (!response.ok) throw new Error((error as { detail?: string })?.detail ?? "Could not remove");
    },
    onSuccess: () => {
      flash("Removed. They no longer have access.");
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ["members", rid] });
    },
    onError: (e) => flash(errorText(e), true),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE("/v1/restaurants/{restaurant_id}/invites/{invite_id}", {
        params: { path: { ...path, invite_id: id } },
      });
      if (!response.ok) throw new Error("Could not cancel the invite");
    },
    onSuccess: () => {
      flash("Invite cancelled");
      void qc.invalidateQueries({ queryKey: ["invites", rid] });
    },
    onError: (e) => flash(errorText(e), true),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash("Link copied");
    } catch {
      flash("Couldn't copy. Select the link and copy it manually.", true);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <PageHeader
          title="Staff"
          subtitle={isOwner ? "Invite people with a link, and choose what each person can do." : "Only owners can change staff."}
          actions={
            isOwner && (
              <button type="button" onClick={() => setInviting(true)} className={btn.primary}>
                + Invite staff
              </button>
            )
          }
        />

        <Card className="mt-6" title="Team">
          {members.isPending && <p className="text-muted">Loading…</p>}
          {members.isError && <p className="text-danger">{members.error.message}</p>}
          <ul className="divide-y divide-border">
            {members.data?.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold uppercase">
                  {(m.email ?? "?")[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.email ?? "No email on file"} {m.is_you && <span className="text-muted">(you)</span>}
                  </span>
                  <span className="text-xs text-muted">Joined {dateFmt.format(new Date(m.created_at))}</span>
                </span>
                {isOwner && !m.is_you ? (
                  <select
                    value={m.role}
                    aria-label={`Role for ${m.email ?? "member"}`}
                    onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })}
                    className="h-9 rounded-lg border border-border bg-surface-2 px-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r.role} value={r.role}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge tone={m.role === "owner" ? "brand" : "muted"}>{roleLabel(m.role)}</Badge>
                )}
                {isOwner && !m.is_you && (
                  <button type="button" onClick={() => setRemoving(m)} className={`${btn.ghost} hover:text-danger`}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {isOwner && (
          <Card className="mt-5" title="Pending invites">
            {invites.data?.length === 0 && <p className="text-sm text-muted">No open invites.</p>}
            <ul className="divide-y divide-border">
              {invites.data?.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <Badge>{roleLabel(inv.role)}</Badge>
                  <span className="min-w-0 flex-1 truncate">{inv.email ?? "Anyone with the link"}</span>
                  <span className="text-xs text-muted">sent {relTime(inv.created_at, now)}</span>
                  <button type="button" onClick={() => copy(inv.link)} className={btn.ghost}>
                    Copy link
                  </button>
                  <button type="button" onClick={() => revoke.mutate(inv.id)} className={`${btn.ghost} hover:text-danger`}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="mt-5" title="What each role can do">
          <dl className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r.role} className="rounded-xl bg-surface-2/60 px-4 py-3">
                <dt className="font-semibold">{r.label}</dt>
                <dd className="text-sm text-muted">{r.can}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {inviting && (
        <InviteDialog
          rid={rid}
          onClose={() => setInviting(false)}
          onCreated={(inv) => {
            setInviting(false);
            setCreated(inv);
            void qc.invalidateQueries({ queryKey: ["invites", rid] });
          }}
          onError={(e) => flash(errorText(e), true)}
        />
      )}
      {created && (
        <Modal
          title="Invite link ready"
          onClose={() => setCreated(null)}
          footer={
            <>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Join ${restaurant?.name ?? "our restaurant"} on QR Menu as ${roleLabel(created.role)}: ${created.link}`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className={`${btn.secondary} inline-flex items-center`}
              >
                Share on WhatsApp
              </a>
              <span className="flex-1" />
              <button type="button" onClick={() => copy(created.link)} className={btn.primary}>
                Copy link
              </button>
            </>
          }
        >
          <p className="text-sm">
            Send this link to the person joining as <strong>{roleLabel(created.role)}</strong>. It works once and expires
            in 7 days.
          </p>
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-xs break-all select-all">{created.link}</p>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Remove from restaurant?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <span className="flex-1" />
              <button type="button" onClick={() => setRemoving(null)} className={btn.ghost}>
                Keep
              </button>
              <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(removing.id)} className={btn.danger}>
                Remove
              </button>
            </>
          }
        >
          <p className="text-sm">
            {removing.email ?? "This person"} will lose access to {restaurant?.name} immediately.
          </p>
        </Modal>
      )}
      {toast}
    </div>
  );
}

function InviteDialog({
  rid,
  onClose,
  onCreated,
  onError,
}: {
  rid: string;
  onClose: () => void;
  onCreated: (i: Invite) => void;
  onError: (e: unknown) => void;
}) {
  const [role, setRole] = useState<Role>("staff");
  const [email, setEmail] = useState("");
  const emailOk = email.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/restaurants/{restaurant_id}/invites", {
          params: { path: { restaurant_id: rid } },
          body: { role, email: email.trim() || null },
        }),
      ),
    onSuccess: onCreated,
    onError,
  });
  return (
    <Modal
      title="Invite staff"
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btn.ghost}>
            Cancel
          </button>
          <button type="button" disabled={!emailOk || create.isPending} onClick={() => create.mutate()} className={btn.primary}>
            Create invite link
          </button>
        </>
      }
    >
      <fieldset>
        <legend className="text-sm font-medium">Role</legend>
        <div className="mt-2 space-y-2">
          {ROLES.map((r) => (
            <label
              key={r.role}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
                role === r.role ? "border-brand bg-brand/10" : "border-border"
              }`}
            >
              <input type="radio" name="role" checked={role === r.role} onChange={() => setRole(r.role)} className="accent-[var(--brand)]" />
              <span>
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="text-xs text-muted">{r.can}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">
        Their email <span className="font-normal text-muted">(optional, just for your reference)</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" className={fieldClass} />
        {!emailOk && <span className="mt-1 block text-xs text-danger">That doesn&apos;t look like an email.</span>}
      </label>
    </Modal>
  );
}
