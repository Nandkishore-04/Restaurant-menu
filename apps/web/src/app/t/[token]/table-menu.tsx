"use client";

import { formatMoney, type PublicMenu, type Schemas } from "@qrmenu/api-client";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CartSheet } from "@/components/cart-sheet";
import { BagIcon, ReceiptIcon, SearchIcon } from "@/components/icons";
import { ItemCard } from "@/components/item-card";
import { ItemSheet } from "@/components/item-sheet";
import { JoinScreen } from "@/components/join-screen";
import { OrdersSheet } from "@/components/orders-sheet";
import { PaymentPage } from "@/components/payment-page";
import { useGuestSession, type GuestSession } from "@/lib/guest-session";
import { useLiveChannel } from "@/lib/live";
import { useBill, useCart, useCartActions, useMenu, useOrders } from "@/lib/queries";

type MenuItem = Schemas["MenuItemOut"];

export function TableMenu() {
  const { token: qr } = useParams<{ token: string }>();
  const menu = useMenu(qr);
  const session = useGuestSession(qr);

  if (menu.isPending) return <MenuSkeleton />;
  if (menu.isError) {
    const notFound = menu.error.status === 404;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-xl font-semibold">
          {notFound ? "This QR code isn't active" : "Couldn't load the menu"}
        </h1>
        <p className="mt-2 text-muted">
          {notFound ? "Please ask the staff for help." : menu.error.message}
        </p>
        {!notFound && (
          <button
            type="button"
            onClick={() => menu.refetch()}
            className="mx-auto mt-6 h-11 rounded-xl bg-brand px-6 font-semibold text-brand-ink"
          >
            Try again
          </button>
        )}
      </main>
    );
  }
  if (!session) return <JoinScreen qr={qr} menu={menu.data} />;
  return <TableExperience qr={qr} menu={menu.data} session={session} />;
}

function TableExperience({ qr, menu, session }: { qr: string; menu: PublicMenu; session: GuestSession }) {
  const cart = useCart(qr, session);
  const orders = useOrders(qr, session);
  const actions = useCartActions(qr, session);
  const bill = useBill(qr, session);
  useLiveChannel(session.channel);

  const [view, setView] = useState<"menu" | "cart" | "orders" | "pay">("menu");
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  const fail = (e: unknown) =>
    showToast(e instanceof Error ? e.message : "Something went wrong. Please try again.", true);

  const lines = useMemo(() => cart.data?.items ?? [], [cart.data]);
  const cartCount = lines.reduce((n, l) => n + l.quantity, 0);
  const busy = actions.add.isPending || actions.setQty.isPending;
  const activeOrders = (orders.data ?? []).filter((o) => !["served", "cancelled"].includes(o.status));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        ...c,
        items: (c.items ?? []).filter(
          (i) =>
            (!vegOnly || i.dietary === "veg" || i.dietary === "vegan") &&
            (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [menu.categories, search, vegOnly]);

  const dishes = useMemo(() => {
    const map = new Map<string, { imageUrl: string | null; category: string }>();
    for (const c of menu.categories)
      for (const i of c.items ?? []) map.set(i.id, { imageUrl: i.image_url ?? null, category: c.name });
    return map;
  }, [menu.categories]);
  const dishInfo = (id: string) => dishes.get(id);
  const categoryOf = (item: MenuItem) => dishes.get(item.id)?.category ?? "";

  // My own plain line for an item (no note) drives the inline +/- on the menu card.
  const myLine = (itemId: string) =>
    lines.find((l) => l.menu_item_id === itemId && l.guest_id === session.guestId && !l.note);
  const othersQty = (itemId: string) =>
    lines
      .filter((l) => l.menu_item_id === itemId && l.guest_id !== session.guestId)
      .reduce((n, l) => n + l.quantity, 0);

  const addItem = (item: MenuItem, quantity = 1, note: string | null = null) =>
    actions.add.mutate(
      { menuItemId: item.id, quantity, note },
      {
        onSuccess: () => {
          setOpenItem(null);
          showToast(`Added ${item.name}`);
        },
        onError: fail,
      },
    );

  const changeQty = (lineId: string, quantity: number) =>
    actions.setQty.mutate({ lineId, quantity }, { onError: fail });

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl leading-tight font-semibold tracking-tight">
              {menu.restaurant_name}
            </h1>
            <p className="text-sm text-muted">
              Table {menu.table_label} · Hi, {session.guestName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("orders")}
            className="relative flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-sm font-medium"
          >
            <ReceiptIcon width={18} height={18} /> Orders
            {activeOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-brand-ink">
                {activeOrders.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex gap-2 px-4 pb-3">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-brand">
            <SearchIcon width={18} height={18} className="text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes"
              aria-label="Search dishes"
              className="w-full bg-transparent text-[15px] outline-none"
            />
          </label>
          <button
            type="button"
            aria-pressed={vegOnly}
            onClick={() => setVegOnly((v) => !v)}
            className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${
              vegOnly ? "border-veg bg-veg/10 text-veg" : "border-border bg-surface"
            }`}
          >
            <span className={`h-4 w-7 rounded-full p-0.5 transition ${vegOnly ? "bg-veg" : "bg-border"}`}>
              <span className={`block size-3 rounded-full bg-white transition ${vegOnly ? "translate-x-3" : ""}`} />
            </span>
            Veg
          </button>
        </div>
        {!search && (
          <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3" aria-label="Menu sections">
            {visible.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                className="shrink-0 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium whitespace-nowrap transition hover:border-brand hover:text-brand"
              >
                {c.name}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="px-4">
        {visible.length === 0 && (
          <p className="py-16 text-center text-muted">No dishes match your search.</p>
        )}
        {visible.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-44 pt-7">
            <h2 className="flex items-baseline gap-2 font-display text-xl font-semibold">
              {c.name}
              <span className="font-sans text-sm font-normal text-muted">{c.items.length} items</span>
            </h2>
            <ul className="divide-y divide-border">
              {c.items.map((item) => {
                const mine = myLine(item.id);
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    category={c.name}
                    currency={menu.currency}
                    myQty={mine?.quantity ?? 0}
                    othersQty={othersQty(item.id)}
                    busy={busy}
                    onAdd={() => addItem(item)}
                    onChangeQty={(n) => mine && changeQty(mine.id, n)}
                    onOpen={() => setOpenItem(item)}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </main>

      {cartCount === 0 && view === "menu" && bill.data && bill.data.due_paise > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl p-4">
          <button
            type="button"
            onClick={() => setView("pay")}
            className="animate-sheet flex h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 text-brand-ink shadow-xl"
          >
            <span className="text-left">
              <span className="block text-sm font-semibold">
                {bill.data.pending_payment ? "Payment in progress" : "Done eating? Pay your bill"}
              </span>
              <span className="block text-xs opacity-85 tabular-nums">
                {formatMoney(bill.data.due_paise, menu.currency)} · UPI or cash
              </span>
            </span>
            <span className="font-semibold">Pay bill →</span>
          </button>
        </div>
      )}

      {cartCount > 0 && view === "menu" && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl p-4">
          <button
            type="button"
            onClick={() => setView("cart")}
            className="animate-sheet flex h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 text-brand-ink shadow-xl"
          >
            <span className="flex items-center gap-2 text-left">
              <BagIcon />
              <span>
                <span className="block text-sm font-semibold">
                  {cartCount} item{cartCount > 1 ? "s" : ""} in table cart
                </span>
                {cart.data && (
                  <span className="block text-xs opacity-85 tabular-nums">
                    {formatMoney(cart.data.totals.total_paise, menu.currency)} incl. GST
                  </span>
                )}
              </span>
            </span>
            <span className="font-semibold">View cart →</span>
          </button>
        </div>
      )}

      {openItem && (
        <ItemSheet
          item={openItem}
          category={categoryOf(openItem)}
          currency={menu.currency}
          busy={actions.add.isPending}
          onAdd={(q, note) => addItem(openItem, q, note.trim() || null)}
          onClose={() => setOpenItem(null)}
        />
      )}
      {view === "cart" && (
        <CartSheet
          cart={cart.data}
          currency={menu.currency}
          tableLabel={menu.table_label}
          myGuestId={session.guestId}
          dishInfo={dishInfo}
          busy={busy}
          placing={actions.placeOrder.isPending}
          onChangeQty={changeQty}
          onClose={() => setView("menu")}
          onPlaceOrder={() =>
            actions.placeOrder.mutate(undefined, {
              onSuccess: (o) => {
                setView("orders");
                showToast(`Order #${o.order_number} sent to the kitchen`);
              },
              onError: fail,
            })
          }
        />
      )}
      {view === "orders" && (
        <OrdersSheet
          orders={orders.data ?? []}
          currency={menu.currency}
          duePaise={bill.data?.due_paise ?? 0}
          paidPaise={bill.data?.paid_paise ?? 0}
          onPay={() => setView("pay")}
          onClose={() => setView("menu")}
        />
      )}
      {view === "pay" && bill.data && (
        <PaymentPage
          qr={qr}
          session={session}
          bill={bill.data}
          onClose={() => setView("menu")}
          onToast={showToast}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`animate-sheet fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg ${
            toast.error ? "bg-danger text-white" : "bg-text text-bg"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 pt-6" aria-label="Loading menu">
      <div className="h-7 w-48 rounded bg-surface-2" />
      <div className="mt-2 h-4 w-28 rounded bg-surface-2" />
      <div className="mt-6 h-10 rounded-xl bg-surface-2" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="mt-6 flex gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-surface-2" />
            <div className="h-4 w-1/4 rounded bg-surface-2" />
          </div>
          <div className="h-9 w-24 rounded-lg bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
