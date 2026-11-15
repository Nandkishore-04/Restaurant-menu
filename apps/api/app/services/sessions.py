from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DiningTable, Restaurant, SessionStatus, TableSession
from app.services.errors import Gone, NotFound


async def resolve_qr_token(db: AsyncSession, qr_token: str) -> tuple[Restaurant, DiningTable]:
    """Cross-tenant lookup: must run in a system_session."""
    row = (
        await db.execute(
            select(Restaurant, DiningTable)
            .join(DiningTable, DiningTable.restaurant_id == Restaurant.id)
            .where(DiningTable.qr_token == qr_token)
        )
    ).first()
    if row is None:
        raise NotFound("Unknown table QR code")
    restaurant, table = row
    if not restaurant.is_active or not table.is_active:
        raise NotFound("This table is not accepting orders")
    return restaurant, table


async def get_or_open_session(db: AsyncSession, table: DiningTable) -> TableSession:
    """Everyone scanning the same table joins the same open session (shared cart)."""
    stmt = select(TableSession).where(
        TableSession.table_id == table.id, TableSession.status == SessionStatus.OPEN
    )
    existing = await db.scalar(stmt)
    if existing:
        return existing
    try:
        async with db.begin_nested():
            session = TableSession(restaurant_id=table.restaurant_id, table_id=table.id)
            db.add(session)
            await db.flush()
        return session
    except IntegrityError:
        # Another guest opened it at the same moment; join theirs.
        return (await db.execute(stmt)).scalar_one()


async def get_open_session(
    db: AsyncSession, session_id: UUID, *, lock: bool = False
) -> TableSession:
    stmt = select(TableSession).where(TableSession.id == session_id)
    if lock:
        stmt = stmt.with_for_update()
    session = await db.scalar(stmt)
    if session is None:
        raise NotFound("Session not found")
    if session.status != SessionStatus.OPEN:
        raise Gone("This table session has been closed. Scan the QR code again.")
    return session
