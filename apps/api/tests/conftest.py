"""Test setup: spins up a throwaway real Postgres (via pgserver, no Docker needed) unless
TEST_DATABASE_URL is provided, runs the Alembic migrations, and exposes an HTTP client."""

import os
import tempfile
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest

STAFF_JWT_SECRET = "test-supabase-jwt-secret-0123456789abcdef"


def _database_url() -> str:
    if url := os.environ.get("TEST_DATABASE_URL"):
        return url
    import pgserver

    server = pgserver.get_server(tempfile.mkdtemp(prefix="qrmenu-pg-"), cleanup_mode="stop")
    socket_dir = server.get_uri().split("host=")[1]
    return f"postgresql+asyncpg://postgres@/postgres?host={socket_dir}"


# Must be configured before any app module is imported.
os.environ.update(
    ENVIRONMENT="test",
    DATABASE_URL=_database_url(),
    SUPABASE_JWT_SECRET=STAFF_JWT_SECRET,
    GUEST_TOKEN_SECRET="test-guest-secret-0123456789abcdefghij",
    SUPABASE_URL="",
    SUPABASE_SERVICE_ROLE_KEY="",
)

import httpx  # noqa: E402
from alembic.config import Config  # noqa: E402

from alembic import command  # noqa: E402
from app.main import app  # noqa: E402
from app.services.realtime import NoopPublisher  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_db() -> None:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.attributes["database_url"] = os.environ["DATABASE_URL"]
    command.upgrade(cfg, "head")


@pytest.fixture
def publisher() -> NoopPublisher:
    pub = NoopPublisher()
    app.state.publisher = pub
    return pub


@pytest.fixture
async def client(publisher: NoopPublisher) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def staff_token(user_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": str(user_id), "aud": "authenticated", "iat": now, "exp": now + timedelta(hours=1)},
        STAFF_JWT_SECRET,
        algorithm="HS256",
    )


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_restaurant(client: httpx.AsyncClient) -> Callable[..., Any]:
    """Creates an owner + restaurant with one category, two items and one table."""

    async def _make(tax_rate_bps: int = 500, prices_include_tax: bool = False) -> dict[str, Any]:
        owner = staff_token(uuid.uuid4())
        slug = f"r-{uuid.uuid4().hex[:10]}"
        r = await client.post(
            "/v1/restaurants",
            json={
                "name": "Test Dhaba",
                "slug": slug,
                "tax_rate_bps": tax_rate_bps,
                "prices_include_tax": prices_include_tax,
            },
            headers=auth(owner),
        )
        assert r.status_code == 201, r.text
        rid = r.json()["id"]
        base = f"/v1/restaurants/{rid}"
        cat = await client.post(
            f"{base}/menu/categories", json={"name": "Mains"}, headers=auth(owner)
        )
        assert cat.status_code == 201, cat.text
        items = {}
        for name, price, diet in [
            ("Paneer Tikka", 25000, "veg"),
            ("Butter Chicken", 32000, "non_veg"),
        ]:
            it = await client.post(
                f"{base}/menu/items",
                json={
                    "category_id": cat.json()["id"],
                    "name": name,
                    "price_paise": price,
                    "dietary": diet,
                },
                headers=auth(owner),
            )
            assert it.status_code == 201, it.text
            items[name] = it.json()["id"]
        table = await client.post(f"{base}/tables", json={"label": "T1"}, headers=auth(owner))
        assert table.status_code == 201, table.text
        return {
            "id": rid,
            "owner": owner,
            "items": items,
            "qr_token": table.json()["qr_token"],
            "table": table.json(),
        }

    return _make
