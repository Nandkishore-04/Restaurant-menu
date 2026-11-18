"use client";

import { formatMoney, type Schemas } from "@qrmenu/api-client";
import { DishImage } from "@qrmenu/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { api, unwrap } from "@/lib/api";
import { DietMark, DIET_LABEL, type Dietary } from "./diet-mark";
import { fieldClass, Modal } from "./modal";
import { useMyRestaurant } from "./restaurant-shell";

type Category = Schemas["CategoryOut"];
type Item = Schemas["MenuItemOut"];

type ItemEditorState = { mode: "new"; categoryId: string } | { mode: "edit"; item: Item };
type CategoryEditorState = { mode: "new" } | { mode: "edit"; category: Category };

export function MenuEditor() {
  const { rid } = useParams<{ rid: string }>();
  const { canEditMenu, isPending: rolePending, restaurant } = useMyRestaurant(rid);
  const qc = useQueryClient();
  const key = ["menu-admin", rid];
  const path = { restaurant_id: rid };

  const menu = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/v1/restaurants/{restaurant_id}/menu", { params: { path } })),
    enabled: canEditMenu,
  });

  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = (text: string, error = false) => {
    setNotice({ text, error });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  };
  const onError = (e: unknown) =>
    flash(e instanceof Error ? e.message : "Something went wrong", true);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const setMenu = (data: Category[]) => qc.setQueryData(key, data);

  // Quick "sold out" toggle: update the screen immediately, roll back on failure.
  const toggleAvailable = useMutation({
    mutationFn: (item: Item) =>
      unwrap(
        api.PATCH("/v1/restaurants/{restaurant_id}/menu/items/{item_id}", {
          params: { path: { ...path, item_id: item.id } },
          body: { is_available: !item.is_available },
        }),
      ),
    onMutate: (item) => {
      const previous = qc.getQueryData<Category[]>(key);
      qc.setQueryData<Category[]>(key, (cats) =>
        cats?.map((c) => ({
          ...c,
          items: c.items?.map((i) => (i.id === item.id ? { ...i, is_available: !i.is_available } : i)),
        })),
      );
      return { previous };
    },
    onSuccess: (item) => flash(`${item.name} is now ${item.is_available ? "available" : "sold out"}`),
    onError: (e, _item, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      onError(e);
    },
  });

  const toggleCategory = useMutation({
    mutationFn: (c: Category) =>
      unwrap(
        api.PATCH("/v1/restaurants/{restaurant_id}/menu/categories/{category_id}", {
          params: { path: { ...path, category_id: c.id } },
          body: { is_active: !c.is_active },
        }),
      ),
    onSuccess: (c) => {
      flash(`${c.name} is now ${c.is_active ? "visible" : "hidden"} on the menu`);
      void refresh();
    },
    onError,
  });

  const deleteCategory = useMutation({
    mutationFn: async (c: Category) => {
      const { response, error } = await api.DELETE(
        "/v1/restaurants/{restaurant_id}/menu/categories/{category_id}",
        { params: { path: { ...path, category_id: c.id } } },
      );
      if (!response.ok) {
        const detail = (error as { detail?: unknown } | undefined)?.detail;
        throw new Error(typeof detail === "string" ? detail : "Could not delete this category");
      }
    },
    onSuccess: () => {
      flash("Category deleted");
      void refresh();
    },
    onError,
  });

  const reorderCategories = useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(
        api.PUT("/v1/restaurants/{restaurant_id}/menu/categories/order", {
          params: { path },
          body: { ids },
        }),
      ),
    onSuccess: setMenu,
    onError,
  });

  const reorderItems = useMutation({
    mutationFn: (v: { categoryId: string; ids: string[] }) =>
      unwrap(
        api.PUT("/v1/restaurants/{restaurant_id}/menu/categories/{category_id}/items/order", {
          params: { path: { ...path, category_id: v.categoryId } },
          body: { ids: v.ids },
        }),
      ),
    onSuccess: setMenu,
    onError,
  });

  if (!rolePending && !canEditMenu) {
    return <p className="p-8 text-muted">Only owners and managers can edit the menu.</p>;
  }

  const categories = menu.data ?? [];
  const allItems = categories.flatMap((c) => c.items ?? []);
  const soldOut = allItems.filter((i) => !i.is_available).length;
  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const shown = categories
    .map((c) => ({
      ...c,
      items: (c.items ?? []).filter((i) => !searching || i.name.toLowerCase().includes(q)),
    }))
    .filter((c) => !searching || c.items.length > 0);

  const move = <T extends { id: string }>(list: T[], index: number, delta: number) => {
    const ids = list.map((x) => x.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return null;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return ids;
  };
  const reorderBusy = reorderCategories.isPending || reorderItems.isPending;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Menu</h1>
            <p className="mt-1 text-sm text-muted">
              {categories.length} categories · {allItems.length} dishes
              {soldOut > 0 && <span className="text-warn"> · {soldOut} sold out</span>}
              {" · "}changes reach customers&apos; phones within a minute
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a dish"
              aria-label="Find a dish"
              className="h-10 w-48 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => setCategoryEditor({ mode: "new" })}
              className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:border-brand"
            >
              + Category
            </button>
            <button
              type="button"
              disabled={categories.length === 0}
              onClick={() => setItemEditor({ mode: "new", categoryId: categories[0].id })}
              className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-40"
            >
              + Dish
            </button>
          </div>
        </div>

        {menu.isPending && <p className="mt-10 text-muted">Loading menu…</p>}
        {menu.isError && <p className="mt-10 text-danger">{menu.error.message}</p>}
        {menu.isSuccess && categories.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-semibold">Your menu is empty</p>
            <p className="mt-1 text-sm text-muted">
              Start with a category like &ldquo;Starters&rdquo;, then add dishes to it.
            </p>
            <button
              type="button"
              onClick={() => setCategoryEditor({ mode: "new" })}
              className="mt-4 h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink"
            >
              + Add first category
            </button>
          </div>
        )}
        {searching && shown.length === 0 && (
          <p className="mt-10 text-center text-muted">No dishes match &ldquo;{search}&rdquo;.</p>
        )}

        <div className="mt-6 space-y-5">
          {shown.map((cat, ci) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              itemCount={categories.find((c) => c.id === cat.id)?.items?.length ?? 0}
              currency={restaurant?.currency ?? "INR"}
              canReorder={!searching && !reorderBusy}
              isFirst={ci === 0}
              isLast={ci === shown.length - 1}
              onMoveCategory={(delta) => {
                const ids = move(categories, ci, delta);
                if (ids) reorderCategories.mutate(ids);
              }}
              onMoveItem={(index, delta) => {
                const ids = move(cat.items, index, delta);
                if (ids) reorderItems.mutate({ categoryId: cat.id, ids });
              }}
              onToggleVisible={() => toggleCategory.mutate(cat)}
              onRename={() => setCategoryEditor({ mode: "edit", category: cat })}
              onDelete={() => deleteCategory.mutate(cat)}
              onAddItem={() => setItemEditor({ mode: "new", categoryId: cat.id })}
              onEditItem={(item) => setItemEditor({ mode: "edit", item })}
              onToggleItem={(item) => toggleAvailable.mutate(item)}
            />
          ))}
        </div>
      </div>

      {itemEditor && (
        <ItemEditor
          key={itemEditor.mode === "edit" ? itemEditor.item.id : "new"}
          rid={rid}
          state={itemEditor}
          categories={categories}
          onClose={() => setItemEditor(null)}
          onSaved={(text) => {
            setItemEditor(null);
            flash(text);
            void refresh();
          }}
          onError={onError}
        />
      )}
      {categoryEditor && (
        <CategoryEditor
          rid={rid}
          state={categoryEditor}
          onClose={() => setCategoryEditor(null)}
          onSaved={(text) => {
            setCategoryEditor(null);
            flash(text);
            void refresh();
          }}
          onError={onError}
        />
      )}

      {notice && (
        <div
          role="status"
          className={`fixed right-5 bottom-5 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-xl ${
            notice.error ? "bg-danger text-black" : "bg-text text-bg"
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-ok" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

function CategoryCard(p: {
  category: Category & { items: Item[] };
  itemCount: number;
  currency: string;
  canReorder: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveCategory: (delta: number) => void;
  onMoveItem: (index: number, delta: number) => void;
  onToggleVisible: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAddItem: () => void;
  onEditItem: (item: Item) => void;
  onToggleItem: (item: Item) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const c = p.category;
  return (
    <section className={`rounded-2xl border border-border bg-surface ${c.is_active ? "" : "opacity-70"}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex">
            <IconButton label="Move category up" disabled={!p.canReorder || p.isFirst} onClick={() => p.onMoveCategory(-1)}>
              ↑
            </IconButton>
            <IconButton label="Move category down" disabled={!p.canReorder || p.isLast} onClick={() => p.onMoveCategory(1)}>
              ↓
            </IconButton>
          </div>
          <h2 className="font-display text-lg font-semibold">{c.name}</h2>
          <span className="text-sm text-muted">{p.itemCount}</span>
          {!c.is_active && (
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-warn">
              Hidden from customers
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm">
          {confirmDelete ? (
            <>
              <span className="mr-2 text-muted">Delete {c.name}?</span>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-3 py-1.5 hover:bg-surface-2">
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  p.onDelete();
                }}
                className="rounded-md bg-danger px-3 py-1.5 font-semibold text-black"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={p.onToggleVisible} className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text">
                {c.is_active ? "Hide" : "Show"}
              </button>
              <button type="button" onClick={p.onRename} className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text">
                Rename
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={p.itemCount > 0}
                title={p.itemCount > 0 ? "Move or delete its dishes first" : undefined}
                className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                Delete
              </button>
              <button type="button" onClick={p.onAddItem} className="ml-1 rounded-md border border-border px-3 py-1.5 font-medium hover:border-brand">
                + Dish
              </button>
            </>
          )}
        </div>
      </header>

      {c.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          No dishes yet.{" "}
          <button type="button" onClick={p.onAddItem} className="text-brand underline">
            Add one
          </button>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {c.items.map((item, i) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex shrink-0">
                <IconButton label={`Move ${item.name} up`} disabled={!p.canReorder || i === 0} onClick={() => p.onMoveItem(i, -1)}>
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${item.name} down`}
                  disabled={!p.canReorder || i === c.items.length - 1}
                  onClick={() => p.onMoveItem(i, 1)}
                >
                  ↓
                </IconButton>
              </div>
              <DishImage
                name={item.name}
                category={c.name}
                imageUrl={item.image_url}
                soldOut={!item.is_available}
                iconSize={20}
                className="size-12 shrink-0 rounded-lg"
              />
              <button type="button" onClick={() => p.onEditItem(item)} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-2">
                  <DietMark dietary={item.dietary} />
                  <span className={`truncate font-medium ${item.is_available ? "" : "text-muted line-through"}`}>
                    {item.name}
                  </span>
                </span>
                {item.description && <span className="block truncate text-sm text-muted">{item.description}</span>}
              </button>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                {formatMoney(item.price_paise, p.currency)}
              </span>
              <span className="flex w-36 shrink-0 items-center justify-end gap-2 text-sm">
                <span className={item.is_available ? "text-ok" : "text-warn"}>
                  {item.is_available ? "Available" : "Sold out"}
                </span>
                <Switch
                  on={item.is_available}
                  onChange={() => p.onToggleItem(item)}
                  label={`${item.name} available`}
                />
              </span>
              <button
                type="button"
                onClick={() => p.onEditItem(item)}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const DIETS: Dietary[] = ["veg", "non_veg", "egg", "vegan"];
const PRICE_RE = /^\d{1,6}(\.\d{1,2})?$/;

function ItemEditor({
  rid,
  state,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  rid: string;
  state: ItemEditorState;
  categories: Category[];
  onClose: () => void;
  onSaved: (text: string) => void;
  onError: (e: unknown) => void;
}) {
  const existing = state.mode === "edit" ? state.item : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [price, setPrice] = useState(existing ? String(existing.price_paise / 100) : "");
  const [dietary, setDietary] = useState<Dietary>(existing?.dietary ?? "veg");
  const [categoryId, setCategoryId] = useState(
    existing?.category_id ?? (state.mode === "new" ? state.categoryId : ""),
  );
  const [imageUrl, setImageUrl] = useState(existing?.image_url ?? "");
  const [available, setAvailable] = useState(existing?.is_available ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);

  const priceOk = PRICE_RE.test(price.trim());
  const valid = name.trim().length > 0 && priceOk && categoryId !== "";
  const path = { restaurant_id: rid };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        price_paise: Math.round(Number(price.trim()) * 100),
        dietary,
        category_id: categoryId,
        image_url: imageUrl.trim() || null,
        is_available: available,
      };
      return existing
        ? unwrap(
            api.PATCH("/v1/restaurants/{restaurant_id}/menu/items/{item_id}", {
              params: { path: { ...path, item_id: existing.id } },
              body,
            }),
          )
        : unwrap(api.POST("/v1/restaurants/{restaurant_id}/menu/items", { params: { path }, body }));
    },
    onSuccess: (item) => onSaved(existing ? `Saved ${item.name}` : `Added ${item.name}`),
    onError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE("/v1/restaurants/{restaurant_id}/menu/items/{item_id}", {
        params: { path: { ...path, item_id: existing!.id } },
      });
      if (!response.ok) throw new Error("Could not delete this dish");
    },
    onSuccess: () => onSaved(`Deleted ${existing!.name}`),
    onError,
  });

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add a dish"}
      onClose={onClose}
      footer={
        <>
          {existing &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-3 py-2 hover:bg-surface-2">
                  Keep
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                  className="rounded-md bg-danger px-3 py-2 font-semibold text-black"
                >
                  Delete dish
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-muted hover:text-danger">
                Delete
              </button>
            ))}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 font-medium hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setTouched(true);
              if (valid) save.mutate();
            }}
            className="h-10 rounded-lg bg-brand px-5 font-semibold text-brand-ink disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : existing ? "Save" : "Add dish"}
          </button>
        </>
      }
    >
      <label className="block text-sm font-medium">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={fieldClass} autoFocus />
        {touched && !name.trim() && <span className="mt-1 block text-xs text-danger">Enter a name</span>}
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Price (₹)
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="249"
            className={fieldClass}
          />
          {touched && !priceOk && (
            <span className="mt-1 block text-xs text-danger">Enter a price like 249 or 249.50</span>
          )}
        </label>
        <label className="block text-sm font-medium">
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Type</legend>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {DIETS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dietary === d}
              onClick={() => setDietary(d)}
              className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm ${
                dietary === d ? "border-brand bg-brand/10 font-semibold" : "border-border"
              }`}
            >
              <DietMark dietary={d} /> {DIET_LABEL[d]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">
        Description <span className="font-normal text-muted">(optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. Char-grilled cottage cheese, mint chutney"
          className={fieldClass}
        />
      </label>

      <div className="flex items-center gap-4">
        <DishImage
          name={name || "New dish"}
          category={categories.find((c) => c.id === categoryId)?.name}
          imageUrl={imageUrl.trim() || null}
          iconSize={28}
          className="size-20 shrink-0 rounded-xl"
        />
        <p className="text-sm text-muted">
          Preview. Dishes without a photo get a tasteful placeholder automatically.
        </p>
      </div>

      <label className="block text-sm font-medium">
        Photo URL <span className="font-normal text-muted">(optional)</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          type="url"
          placeholder="https://…"
          className={fieldClass}
        />
      </label>

      <label className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-medium">
        Available to order
        <Switch on={available} onChange={() => setAvailable((a) => !a)} label="Available to order" />
      </label>
    </Modal>
  );
}

function CategoryEditor({
  rid,
  state,
  onClose,
  onSaved,
  onError,
}: {
  rid: string;
  state: CategoryEditorState;
  onClose: () => void;
  onSaved: (text: string) => void;
  onError: (e: unknown) => void;
}) {
  const existing = state.mode === "edit" ? state.category : null;
  const [name, setName] = useState(existing?.name ?? "");
  const path = { restaurant_id: rid };
  const save = useMutation({
    mutationFn: () =>
      existing
        ? unwrap(
            api.PATCH("/v1/restaurants/{restaurant_id}/menu/categories/{category_id}", {
              params: { path: { ...path, category_id: existing.id } },
              body: { name: name.trim() },
            }),
          )
        : unwrap(
            api.POST("/v1/restaurants/{restaurant_id}/menu/categories", {
              params: { path },
              body: { name: name.trim() },
            }),
          ),
    onSuccess: (c) => onSaved(existing ? `Renamed to ${c.name}` : `Added ${c.name}`),
    onError,
  });

  return (
    <Modal
      title={existing ? "Rename category" : "Add a category"}
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 font-medium hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="h-10 rounded-lg bg-brand px-5 font-semibold text-brand-ink disabled:opacity-50"
          >
            {existing ? "Save" : "Add category"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <label className="block text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Starters, Biryani, Desserts"
            className={fieldClass}
            autoFocus
          />
        </label>
      </form>
    </Modal>
  );
}
