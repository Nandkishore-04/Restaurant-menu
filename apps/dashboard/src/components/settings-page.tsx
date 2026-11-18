"use client";

import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, unwrap } from "@/lib/api";
import { fieldClass } from "./modal";
import { useMyRestaurant } from "./restaurant-shell";
import { Badge, btn, Card, errorText, PageHeader, useFlash } from "./ui";

const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function SettingsPage() {
  const { rid } = useParams<{ rid: string }>();
  const { restaurant, canEditMenu } = useMyRestaurant(rid);
  if (!restaurant) return <p className="p-8 text-muted">Loading…</p>;
  if (!canEditMenu) return <p className="p-8 text-muted">Only owners and managers can change settings.</p>;
  // Remount the form when the saved values change so it starts from the server state.
  return <SettingsForm key={JSON.stringify(restaurant)} rid={rid} restaurant={restaurant} />;
}

function SettingsForm({ rid, restaurant: r }: { rid: string; restaurant: Schemas["RestaurantOut"] }) {
  const qc = useQueryClient();
  const [toast, flash] = useFlash();
  const [name, setName] = useState(r.name);
  const [logo, setLogo] = useState(r.logo_url ?? "");
  const [gst, setGst] = useState(String(r.tax_rate_bps / 100));
  const [inclusive, setInclusive] = useState(r.prices_include_tax);
  const [vpa, setVpa] = useState(r.upi_vpa ?? "");
  const [payee, setPayee] = useState(r.upi_payee_name ?? "");

  const gstNum = Number(gst);
  const gstOk = gst.trim() !== "" && !Number.isNaN(gstNum) && gstNum >= 0 && gstNum <= 28;
  const vpaOk = vpa.trim() === "" || VPA_RE.test(vpa.trim());
  const valid = name.trim() !== "" && gstOk && vpaOk;
  const dirty =
    name.trim() !== r.name ||
    (logo.trim() || null) !== (r.logo_url ?? null) ||
    Math.round(gstNum * 100) !== r.tax_rate_bps ||
    inclusive !== r.prices_include_tax ||
    (vpa.trim() || null) !== (r.upi_vpa ?? null) ||
    (payee.trim() || null) !== (r.upi_payee_name ?? null);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH("/v1/restaurants/{restaurant_id}", {
          params: { path: { restaurant_id: rid } },
          body: {
            name: name.trim(),
            logo_url: logo.trim() || null,
            tax_rate_bps: Math.round(gstNum * 100),
            prices_include_tax: inclusive,
            upi_vpa: vpa.trim() || null,
            upi_payee_name: payee.trim() || null,
          },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me", "restaurants"] });
      flash("Settings saved");
    },
    onError: (e) => flash(errorText(e), true),
  });

  // Worked example so "prices include GST" is unambiguous.
  const example = 25000;
  const bps = gstOk ? Math.round(gstNum * 100) : 0;
  const exTax = inclusive ? Math.round((example * bps) / (10000 + bps)) : Math.round((example * bps) / 10000);
  const exTotal = inclusive ? example : example + exTax;

  return (
    <div className="h-full overflow-y-auto">
      <form
        className="mx-auto max-w-3xl px-5 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && dirty) save.mutate();
        }}
      >
        <PageHeader
          title="Settings"
          subtitle="Changes show up on guests' phones within a minute."
          actions={
            <button type="submit" disabled={!valid || !dirty || save.isPending} className={btn.primary}>
              {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          }
        />

        <Card className="mt-6" title="Restaurant">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <label className="block text-sm font-medium">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={fieldClass} />
              </label>
              <label className="block text-sm font-medium">
                Logo URL <span className="font-normal text-muted">(optional)</span>
                <input value={logo} onChange={(e) => setLogo(e.target.value)} type="url" placeholder="https://…" className={fieldClass} />
              </label>
              <p className="text-sm text-muted">
                Restaurant address: <span className="font-mono text-text">{r.slug}</span> (fixed)
              </p>
            </div>
            <div className="grid size-28 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-2 text-xs text-muted">
              {logo.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element -- owner-supplied URL preview
                <img src={logo.trim()} alt="Logo preview" className="size-full object-cover" />
              ) : (
                "No logo"
              )}
            </div>
          </div>
        </Card>

        <Card className="mt-5" title="GST">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              GST rate (%)
              <input value={gst} onChange={(e) => setGst(e.target.value)} inputMode="decimal" className={fieldClass} />
              {!gstOk && <span className="mt-1 block text-xs text-danger">Enter a rate between 0 and 28.</span>}
              <span className="mt-1 block text-xs text-muted">Standalone restaurants usually charge 5%.</span>
            </label>
            <label className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-3 text-sm">
              <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="mt-0.5 size-5 accent-[var(--brand)]" />
              <span>
                <span className="block font-medium">Menu prices already include GST</span>
                <span className="text-xs text-muted">Leave off if GST is added on top at checkout.</span>
              </span>
            </label>
          </div>
          <p className="mt-4 rounded-lg border border-border px-4 py-3 text-sm text-muted tabular-nums">
            Example: a {formatMoney(example)} dish → guest pays <strong className="text-text">{formatMoney(exTotal)}</strong>{" "}
            ({formatMoney(exTax)} GST {inclusive ? "included" : "added"}).
          </p>
        </Card>

        <Card
          className="mt-5"
          title="UPI payments"
          actions={r.upi_vpa ? <Badge tone="ok">Live: guests pay you</Badge> : <Badge tone="warn">Demo QR</Badge>}
        >
          <p className="mb-4 text-sm text-muted">
            Guests scan a QR code for your UPI ID at the end of the meal. Until you add one, they see a demo QR that
            can&apos;t receive money.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              UPI ID
              <input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="yourname@okaxis" className={fieldClass} />
              {!vpaOk && <span className="mt-1 block text-xs text-danger">UPI IDs look like name@bank.</span>}
            </label>
            <label className="block text-sm font-medium">
              Name shown to guests
              <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={name || "Restaurant name"} maxLength={100} className={fieldClass} />
            </label>
          </div>
          <p className="mt-3 text-xs text-warn">
            Double-check the UPI ID: guests&apos; money goes straight to it. Leave it empty to use the demo QR.
          </p>
        </Card>
      </form>
      {toast}
    </div>
  );
}
