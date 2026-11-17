"""Create real Supabase Auth logins for the demo and link them to the demo data.

Run after `scripts.seed_demo`, with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set
(from `npx supabase status`) and DATABASE_URL pointing at the API's database:

    uv run python -m scripts.create_demo_logins [--password ...] [--restaurant "Spice Route Dhaba"]

Idempotent: existing users get their password reset and memberships are upserted.
"""

import argparse
import asyncio
import uuid

import httpx
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db.session import engine, system_session
from app.models import MemberRole, PlatformAdmin, Restaurant, RestaurantMember

LOGINS: list[tuple[str, MemberRole | None, bool]] = [
    # email, role in the demo restaurant, platform admin?
    ("owner@spiceroute.demo", MemberRole.OWNER, False),
    ("manager@spiceroute.demo", MemberRole.MANAGER, False),
    ("waiter@spiceroute.demo", MemberRole.STAFF, False),
    ("chef@spiceroute.demo", MemberRole.KITCHEN, False),
    ("admin@qrmenu.demo", None, True),
]


def upsert_user(http: httpx.Client, email: str, password: str) -> uuid.UUID:
    r = http.post(
        "/auth/v1/admin/users", json={"email": email, "password": password, "email_confirm": True}
    )
    if r.status_code in (200, 201):
        return uuid.UUID(r.json()["id"])
    # Already exists: look it up and reset the password so the printed one works.
    users = http.get("/auth/v1/admin/users", params={"per_page": 1000}).json()["users"]
    user = next((u for u in users if u["email"] == email), None)
    if user is None:
        r.raise_for_status()
        raise SystemExit(f"Could not create {email}: {r.text}")
    http.put(f"/auth/v1/admin/users/{user['id']}", json={"password": password}).raise_for_status()
    return uuid.UUID(user["id"])


async def link(
    restaurant_name: str, users: list[tuple[str, uuid.UUID, MemberRole | None, bool]]
) -> str:
    async with system_session() as db:
        restaurant = await db.scalar(
            select(Restaurant)
            .where(Restaurant.name == restaurant_name)
            .order_by(Restaurant.created_at.desc())
        )
        if restaurant is None:
            raise SystemExit(
                f"Restaurant {restaurant_name!r} not found. Run scripts.seed_demo first."
            )
        for email, uid, role, is_admin in users:
            # The seed script's placeholder accounts share these emails; drop them so each
            # person appears once and only the real Supabase login has access.
            await db.execute(
                delete(RestaurantMember).where(
                    RestaurantMember.email == email, RestaurantMember.user_id != uid
                )
            )
            await db.execute(
                delete(PlatformAdmin).where(
                    PlatformAdmin.email == email, PlatformAdmin.user_id != uid
                )
            )
            if role:
                member = await db.scalar(
                    select(RestaurantMember).where(
                        RestaurantMember.restaurant_id == restaurant.id,
                        RestaurantMember.user_id == uid,
                    )
                )
                if member:
                    member.role, member.email = role, email
                else:
                    db.add(
                        RestaurantMember(
                            restaurant_id=restaurant.id, user_id=uid, role=role, email=email
                        )
                    )
            if is_admin and await db.get(PlatformAdmin, uid) is None:
                db.add(PlatformAdmin(user_id=uid, email=email))
    await engine.dispose()
    return restaurant.name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--password", default="demo-password-123")
    parser.add_argument("--restaurant", default="Spice Route Dhaba")
    args = parser.parse_args()

    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see `npx supabase status`)."
        )
    key = settings.supabase_service_role_key
    with httpx.Client(
        base_url=settings.supabase_url,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=15,
    ) as http:
        created = [
            (email, upsert_user(http, email, args.password), role, admin)
            for email, role, admin in LOGINS
        ]
    name = asyncio.run(link(args.restaurant, created))

    print(f"Logins for {name} (password for all: {args.password})")
    for email, _, role, admin in created:
        print(f"  {email:28} {'platform admin' if admin else role.value if role else ''}")


if __name__ == "__main__":
    main()
