from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import (
    CartItem,
    DiningTable,
    Order,
    OrderStatus,
    Payment,
    PaymentStatus,
    SessionStatus,
    TableSession,
)
from app.schemas.admin import LiveSession, LiveTable


def qr_url(table: DiningTable) -> str:
    return f"{get_settings().public_web_url}/t/{table.qr_token}"


async def live_tables(db: AsyncSession) -> list[LiveTable]:
    """Every table with its current sitting (if any): orders, bill and payment state."""
    tables = (await db.scalars(select(DiningTable).order_by(DiningTable.label))).all()
    sessions = {
        s.table_id: s
        for s in (
            await db.scalars(select(TableSession).where(TableSession.status == SessionStatus.OPEN))
        ).all()
    }
    sids = [s.id for s in sessions.values()]

    order_sums: dict = {}
    paid: dict = {}
    pending: set = set()
    carts: dict = {}
    if sids:
        for sid, n, total in (
            await db.execute(
                select(Order.session_id, func.count(), func.sum(Order.total_paise))
                .where(Order.session_id.in_(sids), Order.status != OrderStatus.CANCELLED)
                .group_by(Order.session_id)
            )
        ).all():
            order_sums[sid] = (n, int(total or 0))
        for sid, status, amount in (
            await db.execute(
                select(Payment.session_id, Payment.status, func.sum(Payment.amount_paise))
                .where(Payment.session_id.in_(sids))
                .group_by(Payment.session_id, Payment.status)
            )
        ).all():
            if status == PaymentStatus.PAID:
                paid[sid] = int(amount or 0)
            elif status == PaymentStatus.PENDING:
                pending.add(sid)
        for sid, qty in (
            await db.execute(
                select(CartItem.session_id, func.sum(CartItem.quantity))
                .where(CartItem.session_id.in_(sids))
                .group_by(CartItem.session_id)
            )
        ).all():
            carts[sid] = int(qty or 0)

    out = []
    for t in tables:
        s = sessions.get(t.id)
        live = None
        if s:
            n, total = order_sums.get(s.id, (0, 0))
            p = paid.get(s.id, 0)
            live = LiveSession(
                id=s.id,
                opened_at=s.opened_at,
                order_count=n,
                total_paise=total,
                paid_paise=p,
                due_paise=max(total - p, 0),
                payment_pending=s.id in pending,
                cart_items=carts.get(s.id, 0),
            )
        out.append(
            LiveTable(
                id=t.id,
                label=t.label,
                seats=t.seats,
                is_active=t.is_active,
                qr_token=t.qr_token,
                qr_url=qr_url(t),
                session=live,
            )
        )
    return out
