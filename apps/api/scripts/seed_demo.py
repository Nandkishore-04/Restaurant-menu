"""Seed a demo restaurant through the running API (local dev only).

Requires the API to run with SUPABASE_JWT_SECRET set, so we can mint a staff token locally:
    uv run python -m scripts.seed_demo [--api http://localhost:8000]
"""

import argparse
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import jwt

from app.core.config import get_settings

MENU = {
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
    "Breads": [("Butter Naan", 5900, "veg", None), ("Tandoori Roti", 3900, "veg", None)],
    "Drinks": [("Masala Chaas", 6900, "veg", None), ("Sweet Lassi", 8900, "veg", None)],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise SystemExit("SUPABASE_JWT_SECRET must be set (local dev only).")
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": "authenticated",
            "iat": now,
            "exp": now + timedelta(days=1),
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    h = {"Authorization": f"Bearer {token}"}

    with httpx.Client(base_url=args.api, headers=h, timeout=10) as c:
        r = c.post(
            "/v1/restaurants",
            json={"name": "Spice Route Dhaba", "slug": f"spice-route-{uuid.uuid4().hex[:6]}"},
        )
        r.raise_for_status()
        rid = r.json()["id"]
        for sort, (cat_name, items) in enumerate(MENU.items()):
            cat = c.post(
                f"/v1/restaurants/{rid}/menu/categories",
                json={"name": cat_name, "sort_order": sort},
            ).json()
            for i, (name, price, diet, desc) in enumerate(items):
                c.post(
                    f"/v1/restaurants/{rid}/menu/items",
                    json={
                        "category_id": cat["id"],
                        "name": name,
                        "price_paise": price,
                        "dietary": diet,
                        "description": desc,
                        "sort_order": i,
                    },
                ).raise_for_status()
        tables = [
            c.post(f"/v1/restaurants/{rid}/tables", json={"label": f"T{n}", "seats": 4}).json()
            for n in range(1, 4)
        ]

    print(f"restaurant_id={rid}")
    print(f"staff_token={token}")
    for t in tables:
        print(f"{t['label']} qr_token={t['qr_token']} url={t['qr_url']}")


if __name__ == "__main__":
    main()
