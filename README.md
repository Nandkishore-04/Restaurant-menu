# QR Menu

Multi-tenant SaaS for QR-code table ordering. Guests scan the QR on their table, browse the
menu, and add to a **shared table cart** from their own phones; one person sends the order
to the kitchen. Restaurants manage menus, tables and live orders from a dashboard.

## Layout

```
apps/
  api/          FastAPI backend (Python 3.12, uv) - the only thing that writes to the DB
  web/          Customer app (Next.js) - opened from the table QR: /t/{qr_token}
  dashboard/    Restaurant dashboard (Next.js) - menu, tables, live orders
packages/
  api-client/   Typed TS client generated from the API's OpenAPI schema
supabase/       Local Supabase stack config (Postgres, Auth, Realtime, Storage)
```

## Architecture rules (keep these as the product grows)

1. **The API is the only writer.** Frontends never read or write tables directly. They call the
   API and only *listen* to Supabase Realtime. Direct PostgREST access is revoked.
2. **Every tenant table has `restaurant_id`, enforced by Postgres Row-Level Security.**
   `tenant_session(restaurant_id)` switches to the restricted `app_api` role, so even a query
   without a `WHERE restaurant_id` only sees that restaurant. `system_session()` bypasses RLS
   and is only for pre-tenant lookups (QR resolution, membership, onboarding).
3. **Prices come from the server.** The cart stores item ids and quantities; totals and order
   snapshots are always computed from the DB. Money is integer **paise**.
4. **Realtime messages are signals, not data.** The API broadcasts `cart_updated`,
   `order_placed`, `order_status`, ... on `session:{id}` / `restaurant:{id}`; clients refetch
   from the API. The transport can later move to self-hosted WebSockets + Redis.
5. **Schema changes only via Alembic migrations** (`apps/api/alembic/versions`).

### Auth

- **Staff** sign in with Supabase Auth. The API verifies the JWT (JWKS, or the HS256 secret for
  legacy/local projects) and checks `restaurant_members` for the role
  (`owner`, `manager`, `staff`, `kitchen`).
- **Guests** never log in. Joining a table (`POST /v1/public/tables/{qr_token}/sessions`) returns
  a short-lived guest token scoped to that restaurant + table session. Closing the session
  invalidates every token for it.

### Ordering flow

```
scan QR -> GET  /v1/public/tables/{qr}/menu
        -> POST /v1/public/tables/{qr}/sessions        (everyone at a table joins one session)
        -> POST/PATCH/DELETE /v1/public/session/cart/items   (shared cart, live-synced)
        -> POST /v1/public/session/orders              (cart -> kitchen, cart cleared)
kitchen -> GET  /v1/restaurants/{id}/orders?status=placed
        -> PATCH /v1/restaurants/{id}/orders/{order}   placed -> accepted -> preparing -> ready -> served
floor   -> POST /v1/restaurants/{id}/table-sessions/{sid}/close
```

Full interactive docs: http://localhost:8000/docs

## Getting started

Prerequisites: Node 24 + pnpm (`corepack enable pnpm`), Python 3.12 + [uv](https://docs.astral.sh/uv/),
Docker (for local Supabase; your user must be able to run `docker ps`).

```bash
pnpm install
cd apps/api && uv sync && cd ../..

pnpm db:start                       # local Supabase; prints URLs + keys
cp apps/api/.env.example apps/api/.env          # fill in keys from `npx supabase status`
cp apps/web/.env.example apps/web/.env.local
cp apps/dashboard/.env.example apps/dashboard/.env.local

pnpm --filter @qrmenu/api migrate   # apply DB migrations
pnpm dev                            # api :8000, web :3000, dashboard :3001
```

## The apps

**Customer app** (`apps/web`, http://localhost:3000/t/{qr_token}), phone-first:
- Welcome screen asks for a first name. Everyone at the table joins the same session.
- Menu has search, a veg-only toggle, category chips and Indian veg/non-veg marks. ADD and +/- work inline.
- Tap a dish for details, a quantity and a kitchen note ("less spicy").
- The shared cart is grouped by person. Anyone can edit any line, and it shows item total, GST and amount to pay.
- Placing an order asks for confirmation first.
- The orders screen tracks each order: Sent → Accepted → Cooking → Ready → Served, plus the table total so far.

**Kitchen display** (`apps/dashboard`, http://localhost:3001):
- A dark board with columns New, Accepted, Cooking and Ready to serve. Oldest orders come first.
- Each ticket shows the order number, table, how long it has waited (amber after 10 min, red after 20), items and highlighted notes.
- A single button advances each ticket. Cancel always needs a confirmation step.
- An optional chime plays for new orders.

**Menu admin** (`apps/dashboard`, the Menu tab, owners and managers only):
- Add, rename, hide/show, reorder and delete categories. A category can only be deleted once it's empty.
- Add or edit dishes: name, price in ₹, veg/non-veg/egg/vegan, category, description and photo URL.
- A one-click switch marks a dish **sold out**.
- Reorder dishes, or delete them. Past orders keep their own copy of each dish.
- Kitchen staff only see the Kitchen tab.

Both apps update live through Supabase Realtime when `NEXT_PUBLIC_REALTIME_ENABLED=true`.
Otherwise they poll the API every 3s.

### Local login without Supabase
1. Run the API with `SUPABASE_JWT_SECRET` set.
2. Run `uv run python -m scripts.seed_demo` in `apps/api`. It creates a demo restaurant and prints QR links and a `staff_token`.
3. Set `NEXT_PUBLIC_DEV_AUTH=true` in `apps/dashboard/.env.local`.
4. Paste the token on the dashboard login page.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run API + both apps |
| `pnpm --filter @qrmenu/api test` | API tests (spins up a throwaway Postgres, no Docker needed) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Across the whole repo |
| `pnpm api:types` | Regenerate the TS client after changing API schemas |
| `cd apps/api && uv run alembic revision --autogenerate -m "..."` | New migration after model changes |
