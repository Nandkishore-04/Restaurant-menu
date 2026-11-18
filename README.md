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

pnpm api:migrate                    # apply DB migrations
pnpm dev:api                        # API on :8010 (separate terminal)
pnpm dev                            # web :3000, dashboard :3001
```

## The apps

**Customer app** (`apps/web`, http://localhost:3000/t/{qr_token}), phone-first:
- Welcome screen asks for a first name. Everyone at the table joins the same session.
- Menu has search, a veg-only toggle, category chips and Indian veg/non-veg marks. ADD and +/- work inline.
- Tap a dish for details, a quantity and a kitchen note ("less spicy").
- The shared cart is grouped by person. Anyone can edit any line, and it shows item total, GST and amount to pay.
- Placing an order asks for confirmation first.
- The orders screen tracks each order: Sent → Accepted → Cooking → Ready → Served, plus the table total so far.

**Paying the bill** (customer app, "Pay bill" once orders are placed):
- A full-screen checkout shows the amount due. The bill combines every order at the table, merges repeat dishes and skips cancelled orders.
- **UPI:** scan the QR code, or tap Google Pay, PhonePe, Paytm or "Other UPI" to open the app with the amount filled in. Then tap "I've completed the payment", optionally adding the UPI transaction ID (UTR).
- **Cash:** tells staff the table is ready to pay.
- A payment stays **pending** until staff confirm it on the dashboard's **Payments** tab. A guest's "I've paid" is never treated as proof.
- The guest then sees a receipt. If staff mark it "not received", the guest is asked to try again.
- **UPI ID:** each restaurant sets its own with `PATCH /v1/restaurants/{id}` (`upi_vpa`, `upi_payee_name`). Until then, guests see a **demo** QR using `demo.restaurant@example`. That handle doesn't exist, so real UPI apps reject it and no money can be sent by mistake.

**Kitchen display** (`apps/dashboard`, http://localhost:3001):
- A dark board with columns New, Accepted, Cooking and Ready to serve. Oldest orders come first.
- Each ticket shows the order number, table, how long it has waited (amber after 10 min, red after 20), items and highlighted notes.
- A single button advances each ticket. Cancel always needs a confirmation step.
- An optional chime plays for new orders.

**Restaurant admin portal** (`apps/dashboard`). Tabs depend on the person's role:

| Tab | Who | What |
|---|---|---|
| Overview | owner, manager | Today's sales, orders and average bill vs yesterday; payments collected; live tables and kitchen; daily sales chart (7/14/30 days, with a table view); top dishes |
| Kitchen | everyone | Live order board |
| Orders | owner, manager, waiter | Order history by day, filters, expandable details |
| Tables | owner, manager, waiter | Live status (free / occupied / payment pending / paid) with bill due; close a table; QR code per table; printable A4 QR cards; add or edit tables; replace a QR code if a photo of it is being misused |
| Payments | owner, manager, waiter | Confirm UPI payments, collect cash |
| Menu | owner, manager | Categories, dishes, sold out |
| Staff | owner manages, manager views | Invite by a one-time link valid for 7 days (copy or share on WhatsApp), change roles, remove people. A restaurant always keeps at least one owner. |
| Settings | owner, manager | Name, logo, GST rate and whether prices include it, UPI ID |

After sign-in, owners and managers land on Overview, waiters on Tables, and kitchen staff on Kitchen.

**Platform admin** (`/platform` in the dashboard, for the SaaS operator): platform-wide restaurants, orders and GMV, a daily GMV chart, and every restaurant with its owner, tables, staff, 30-day orders and GMV, last order, and UPI status. You can suspend or reactivate a restaurant; suspending turns off its QR codes. Platform admins are rows in `platform_admins`. The demo seed creates one; in production, add your own user id there.

**Menu admin** (`apps/dashboard`, the Menu tab, owners and managers only):
- Add, rename, hide/show, reorder and delete categories. A category can only be deleted once it's empty.
- Add or edit dishes: name, price in ₹, veg/non-veg/egg/vegan, category, description and photo URL.
- A one-click switch marks a dish **sold out**.
- Reorder dishes, or delete them. Past orders keep their own copy of each dish.
- Kitchen staff only see the Kitchen tab.

Both apps update live through Supabase Realtime when `NEXT_PUBLIC_REALTIME_ENABLED=true`.
Otherwise they poll the API every 3s.

### Staff sign-in
The dashboard signs staff in with Supabase Auth (email and password), so Supabase must be
running and `NEXT_PUBLIC_SUPABASE_*` must be set. Demo data comes from
`uv run python -m scripts.seed_demo` in `apps/api`, which creates restaurants, order history
and table QR links. Then run `uv run python -m scripts.create_demo_logins` to create real Supabase
logins for the demo. All of them use the password `demo-password-123`:
`owner@`, `manager@`, `waiter@` and `chef@spiceroute.demo`, plus the platform admin `admin@qrmenu.demo`.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm dev:api` | Run both apps / the API |
| `pnpm api:test` | API tests (spins up a throwaway Postgres, no Docker needed) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Across the whole repo |
| `pnpm api:types` | Regenerate the TS client after changing API schemas |
| `cd apps/api && uv run alembic revision --autogenerate -m "..."` | New migration after model changes |
