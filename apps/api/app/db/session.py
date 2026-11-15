"""Database sessions.

Tenant isolation is enforced by Postgres Row-Level Security, not only by app code:

* ``tenant_session(restaurant_id)`` switches to the restricted ``app_api`` role and sets
  ``app.restaurant_id`` for the transaction. RLS policies only expose that restaurant's rows,
  so a missing ``WHERE restaurant_id = ...`` can never leak another tenant's data.
* ``system_session()`` runs as the connection owner and bypasses RLS. Use it ONLY for
  cross-tenant lookups that happen before the tenant is known (QR token resolution,
  membership checks, onboarding a new restaurant).

Both use ``SET LOCAL`` semantics, so they are safe with pooled connections.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_settings = get_settings()
_connect_args = (
    {"statement_cache_size": 0, "prepared_statement_cache_size": 0}
    if _settings.database_use_pooler
    else {}
)

engine = create_async_engine(_settings.database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def system_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session, session.begin():
        yield session


@asynccontextmanager
async def tenant_session(restaurant_id: UUID) -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session, session.begin():
        await session.execute(text("SET LOCAL ROLE app_api"))
        await session.execute(
            text("SELECT set_config('app.restaurant_id', :rid, true)"),
            {"rid": str(restaurant_id)},
        )
        yield session
