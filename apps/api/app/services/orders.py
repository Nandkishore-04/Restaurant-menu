from uuid import UUID

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import GuestIdentity
from app.models import (
    CartItem,
    DiningTable,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    Restaurant,
)
from app.models.enums import ORDER_TRANSITIONS
from app.schemas.ordering import OrderItemOut, OrderOut
from app.services.errors import Conflict, DomainError, NotFound
from app.services.pricing import compute_totals
from app.services.sessions import get_open_session


async def place_order(db: AsyncSession, guest: GuestIdentity) -> Order:
    """Send the whole shared cart to the kitchen. Prices are always taken from the DB,
    never from the client."""
    # Row lock on the session serialises concurrent "Place order" taps from the same table.
    session = await get_open_session(db, guest.session_id, lock=True)
    rows = (
        await db.execute(
            select(CartItem, MenuItem)
            .join(MenuItem, MenuItem.id == CartItem.menu_item_id)
            .where(CartItem.session_id == session.id)
            .order_by(CartItem.created_at)
        )
    ).all()
    if not rows:
        raise DomainError("The cart is empty")
    unavailable = [mi.name for _, mi in rows if not mi.is_available]
    if unavailable:
        raise Conflict(f"No longer available: {', '.join(unavailable)}")

    restaurant = (await db.execute(select(Restaurant))).scalar_one()
    totals = compute_totals(
        [(mi.price_paise, ci.quantity) for ci, mi in rows],
        tax_rate_bps=restaurant.tax_rate_bps,
        prices_include_tax=restaurant.prices_include_tax,
    )
    order_number = (
        await db.execute(
            text(
                "UPDATE restaurants SET order_seq = order_seq + 1 "
                "WHERE id = :rid RETURNING order_seq"
            ),
            {"rid": restaurant.id},
        )
    ).scalar_one()

    order = Order(
        restaurant_id=restaurant.id,
        session_id=session.id,
        table_id=session.table_id,
        order_number=order_number,
        status=OrderStatus.PLACED,
        subtotal_paise=totals.subtotal_paise,
        tax_paise=totals.tax_paise,
        total_paise=totals.total_paise,
        placed_by_guest_id=guest.guest_id,
        placed_by_name=guest.guest_name,
    )
    db.add(order)
    await db.flush()
    db.add_all(
        OrderItem(
            restaurant_id=restaurant.id,
            order_id=order.id,
            menu_item_id=mi.id,
            name=mi.name,
            unit_price_paise=mi.price_paise,
            quantity=ci.quantity,
            line_total_paise=mi.price_paise * ci.quantity,
            note=ci.note,
            guest_name=ci.guest_name,
        )
        for ci, mi in rows
    )
    await db.execute(delete(CartItem).where(CartItem.session_id == session.id))
    await db.flush()
    return order


async def to_out(db: AsyncSession, orders: list[Order]) -> list[OrderOut]:
    if not orders:
        return []
    ids = [o.id for o in orders]
    items = (await db.scalars(select(OrderItem).where(OrderItem.order_id.in_(ids)))).all()
    label_rows = await db.execute(
        select(DiningTable.id, DiningTable.label).where(
            DiningTable.id.in_({o.table_id for o in orders})
        )
    )
    labels = {row.id: row.label for row in label_rows}
    by_order: dict[UUID, list[OrderItemOut]] = {}
    for it in items:
        by_order.setdefault(it.order_id, []).append(OrderItemOut.model_validate(it))
    return [
        OrderOut.model_validate(o).model_copy(
            update={"items": by_order.get(o.id, []), "table_label": labels.get(o.table_id)}
        )
        for o in orders
    ]


async def list_orders(
    db: AsyncSession,
    *,
    session_id: UUID | None = None,
    statuses: list[OrderStatus] | None = None,
    limit: int = 100,
) -> list[Order]:
    stmt = select(Order).order_by(Order.created_at.desc()).limit(limit)
    if session_id:
        stmt = stmt.where(Order.session_id == session_id)
    if statuses:
        stmt = stmt.where(Order.status.in_(statuses))
    return list((await db.scalars(stmt)).all())


async def change_status(db: AsyncSession, order_id: UUID, new_status: OrderStatus) -> Order:
    order = await db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise NotFound("Order not found")
    if new_status not in ORDER_TRANSITIONS[order.status]:
        raise Conflict(f"Cannot move order from {order.status} to {new_status}")
    order.status = new_status
    await db.flush()
    return order
