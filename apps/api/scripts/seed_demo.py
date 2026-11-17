"""Seed demo data for local development and demos.

Requires the API to run with SUPABASE_JWT_SECRET set (so we can mint staff tokens locally)
and DATABASE_URL pointing at the same database:

    uv run python -m scripts.seed_demo [--api http://localhost:8000] [--no-history]

Creates three restaurants (the first one fully set up), ~2 weeks of past orders and
payments so dashboards have something to show, a platform admin, and spare staff logins
for trying the invite flow. Prints every login token and table QR link.
"""

import argparse
import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import jwt
from sqlalchemy import select, update

from app.core.config import get_settings
from app.db.session import engine, system_session
from app.models import (
    DiningTable,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    PlatformAdmin,
    Restaurant,
    SessionStatus,
    TableSession,
)
from app.services.pricing import compute_totals

MAIN_MENU = {
    "Starters": [
        ("Paneer Tikka", 24900, "veg", "Char-grilled cottage cheese, mint chutney"),
        ("Chicken 65", 27900, "non_veg", "Spicy fried chicken, curry leaves"),
        ("Masala Papad", 7900, "veg", None),
    ],
    "Mains": [
        ("Butter Chicken", 34900, "non_veg", "Creamy tomato gravy"),
        ("Dal Makhani", 22900, "veg", "Slow-cooked black lentils"),
        ("Egg Curry", 19900, "egg", None),
    ],
    "Rice & Biryani": [
        ("Hyderabadi Veg Biryani", 26900, "veg", "Basmati, saffron, mint raita"),
        ("Chicken Dum Biryani", 32900, "non_veg", "Slow-cooked, sealed with dough"),
        ("Jeera Rice", 14900, "veg", None),
    ],
    "Breads": [("Butter Naan", 5900, "veg", None), ("Tandoori Roti", 3900, "veg", None)],
    "Desserts": [
        ("Gulab Jamun", 9900, "veg", "Two warm dumplings in rose syrup"),
        ("Rasmalai", 12900, "veg", "Saffron milk, pistachio"),
    ],
    "Drinks": [("Masala Chaas", 6900, "veg", None), ("Sweet Lassi", 8900, "veg", None)],
}

OTHER_RESTAURANTS = [
    (
        "Coastal Curry House",
        {
            "Seafood": [
                ("Prawn Ghee Roast", 42900, "non_veg", "Mangalorean style"),
                ("Fish Curry Meal", 31900, "non_veg", None),
            ],
            "Rice": [("Neer Dosa", 9900, "veg", None), ("Ghee Rice", 15900, "veg", None)],
            "Drinks": [("Sol Kadhi", 7900, "veg", None)],
        },
        4,
    ),
    (
        "Chai Point Cafe",
        {
            "Chai": [("Masala Chai", 4900, "veg", None), ("Ginger Chai", 4900, "veg", None)],
            "Snacks": [
                ("Vada Pav", 5900, "veg", None),
                ("Samosa", 3900, "veg", None),
                ("Bun Maska", 4500, "veg", None),
            ],
        },
        3,
    ),
]

GUEST_NAMES = ["Asha", "Ravi", "Meera", "Kabir", "Priya", "Arjun", "Neha", "Vikram", "Sana", "Dev"]


def mint(secret: str, email: str, user_id: uuid.UUID | None = None) -> tuple[uuid.UUID, str]:
    uid = user_id or uuid.uuid4()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uid),
            "email": email,
            "aud": "authenticated",
            "iat": now,
            "exp": now + timedelta(days=7),
        },
        secret,
        algorithm="HS256",
    )
    return uid, token


def create_restaurant(
    api: str, token: str, name: str, menu: dict, n_tables: int
) -> tuple[str, list[dict]]:
    with httpx.Client(base_url=api, headers={"Authorization": f"Bearer {token}"}, timeout=15) as c:
        slug = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:4]}"
        r = c.post("/v1/restaurants", json={"name": name, "slug": slug})
        r.raise_for_status()
        rid = r.json()["id"]
        for sort, (cat_name, items) in enumerate(menu.items()):
            cat = c.post(
                f"/v1/restaurants/{rid}/menu/categories",
                json={"name": cat_name, "sort_order": sort},
            ).json()
            for name_, price, diet, desc in items:
                c.post(
                    f"/v1/restaurants/{rid}/menu/items",
                    json={
                        "category_id": cat["id"],
                        "name": name_,
                        "price_paise": price,
                        "dietary": diet,
                        "description": desc,
                    },
                ).raise_for_status()
        tables = [
            c.post(f"/v1/restaurants/{rid}/tables", json={"label": f"T{n}", "seats": 4}).json()
            for n in range(1, n_tables + 1)
        ]
    return rid, tables


async def add_history(restaurant_id: str, days: int, busy: float, rng: random.Random) -> None:
    """Closed, paid sittings over the past `days` days (and a few earlier today)."""
    rid = uuid.UUID(restaurant_id)
    async with system_session() as db:
        restaurant = await db.get(Restaurant, rid)
        assert restaurant is not None
        tables = (
            await db.scalars(select(DiningTable).where(DiningTable.restaurant_id == rid))
        ).all()
        items = (await db.scalars(select(MenuItem).where(MenuItem.restaurant_id == rid))).all()
        popular = sorted(items, key=lambda i: rng.random())  # some dishes sell more
        weights = [1 / (k + 1) for k in range(len(popular))]
        now = datetime.now(UTC)
        seq = restaurant.order_seq

        for back in range(days, -1, -1):
            weekend = (now - timedelta(days=back)).weekday() >= 5
            sittings = int(rng.randint(6, 14) * busy * (1.5 if weekend else 1))
            if back == 0:
                sittings = max(2, sittings // 3)  # today so far
            for _ in range(sittings):
                hour = rng.choice([12, 13, 13, 14, 19, 20, 20, 21, 22])
                opened = (now - timedelta(days=back)).replace(
                    hour=hour - 5, minute=rng.randint(0, 59), second=0, microsecond=0
                )  # IST lunch/dinner expressed in UTC
                if opened > now - timedelta(minutes=30):
                    continue
                table = rng.choice(tables)
                session = TableSession(
                    restaurant_id=rid,
                    table_id=table.id,
                    status=SessionStatus.CLOSED,
                    opened_at=opened,
                    closed_at=opened + timedelta(minutes=70),
                )
                db.add(session)
                await db.flush()
                bill_total = 0
                for round_ in range(rng.choice([1, 1, 2])):
                    picks = rng.choices(popular, weights=weights, k=rng.randint(2, 5))
                    lines: dict[uuid.UUID, tuple[MenuItem, int]] = {}
                    for it in picks:
                        prev = lines.get(it.id)
                        lines[it.id] = (it, (prev[1] if prev else 0) + rng.choice([1, 1, 2]))
                    totals = compute_totals(
                        [(it.price_paise, q) for it, q in lines.values()],
                        tax_rate_bps=restaurant.tax_rate_bps,
                        prices_include_tax=restaurant.prices_include_tax,
                    )
                    seq += 1
                    at = opened + timedelta(minutes=5 + 25 * round_)
                    cancelled = rng.random() < 0.03
                    order = Order(
                        restaurant_id=rid,
                        session_id=session.id,
                        table_id=table.id,
                        order_number=seq,
                        status=OrderStatus.CANCELLED if cancelled else OrderStatus.SERVED,
                        subtotal_paise=totals.subtotal_paise,
                        tax_paise=totals.tax_paise,
                        total_paise=totals.total_paise,
                        placed_by_guest_id=uuid.uuid4(),
                        placed_by_name=rng.choice(GUEST_NAMES),
                        created_at=at,
                        updated_at=at,
                    )
                    db.add(order)
                    await db.flush()
                    for it, q in lines.values():
                        db.add(
                            OrderItem(
                                restaurant_id=rid,
                                order_id=order.id,
                                menu_item_id=it.id,
                                name=it.name,
                                unit_price_paise=it.price_paise,
                                quantity=q,
                                line_total_paise=it.price_paise * q,
                                guest_name=order.placed_by_name,
                            )
                        )
                    if not cancelled:
                        bill_total += totals.total_paise
                if bill_total:
                    paid_at = opened + timedelta(minutes=65)
                    db.add(
                        Payment(
                            restaurant_id=rid,
                            session_id=session.id,
                            table_id=table.id,
                            method=rng.choice([PaymentMethod.UPI] * 3 + [PaymentMethod.CASH]),
                            status=PaymentStatus.PAID,
                            amount_paise=bill_total,
                            guest_id=uuid.uuid4(),
                            guest_name=rng.choice(GUEST_NAMES),
                            confirmed_at=paid_at,
                            created_at=paid_at,
                            updated_at=paid_at,
                        )
                    )
        await db.execute(update(Restaurant).where(Restaurant.id == rid).values(order_seq=seq))


async def make_platform_admin(user_id: uuid.UUID, email: str) -> None:
    async with system_session() as db:
        if await db.get(PlatformAdmin, user_id) is None:
            db.add(PlatformAdmin(user_id=user_id, email=email))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--no-history", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise SystemExit("SUPABASE_JWT_SECRET must be set (local dev only).")
    secret = settings.supabase_jwt_secret
    rng = random.Random(42)

    _, owner_token = mint(secret, "owner@spiceroute.demo")
    rid, tables = create_restaurant(args.api, owner_token, "Spice Route Dhaba", MAIN_MENU, 6)
    others = []
    for i, (name, menu, n) in enumerate(OTHER_RESTAURANTS):
        _, tok = mint(secret, f"owner{i + 2}@{name.split()[0].lower()}.demo")
        others.append(create_restaurant(args.api, tok, name, menu, n)[0])

    admin_id, admin_token = mint(secret, "admin@qrmenu.demo")

    async def db_work() -> None:
        # One event loop for all DB work: pooled connections are bound to their loop.
        if not args.no_history:
            await add_history(rid, 13, 1.0, rng)
            for i, other in enumerate(others):
                await add_history(other, 13, 0.6 - 0.2 * i, rng)
        await make_platform_admin(admin_id, "admin@qrmenu.demo")
        await engine.dispose()

    asyncio.run(db_work())
    _, spare1 = mint(secret, "manager@spiceroute.demo")
    _, spare2 = mint(secret, "waiter@spiceroute.demo")

    print(f"restaurant_id={rid}")
    print(f"staff_token={owner_token}")
    print(f"platform_admin_token={admin_token}")
    print(f"spare_token_manager={spare1}")
    print(f"spare_token_waiter={spare2}")
    for t in tables:
        print(f"{t['label']} qr_token={t['qr_token']} url={t['qr_url']}")


if __name__ == "__main__":
    main()
