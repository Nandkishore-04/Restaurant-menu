from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import GuestIdentity
from app.models import CartItem, MenuItem, Restaurant
from app.schemas.ordering import CartLineOut, CartOut
from app.services.errors import Conflict, NotFound
from app.services.pricing import compute_totals
from app.services.sessions import get_open_session


async def get_cart(db: AsyncSession, session_id: UUID) -> CartOut:
    rows = (
        await db.execute(
            select(CartItem, MenuItem)
            .join(MenuItem, MenuItem.id == CartItem.menu_item_id)
            .where(CartItem.session_id == session_id)
            .order_by(CartItem.created_at)
        )
    ).all()
    restaurant = (await db.execute(select(Restaurant))).scalar_one()  # RLS: only this tenant
    lines = [
        CartLineOut(
            id=ci.id,
            menu_item_id=mi.id,
            name=mi.name,
            unit_price_paise=mi.price_paise,
            quantity=ci.quantity,
            line_total_paise=mi.price_paise * ci.quantity,
            note=ci.note,
            guest_id=ci.guest_id,
            guest_name=ci.guest_name,
        )
        for ci, mi in rows
    ]
    totals = compute_totals(
        [(line.unit_price_paise, line.quantity) for line in lines],
        tax_rate_bps=restaurant.tax_rate_bps,
        prices_include_tax=restaurant.prices_include_tax,
    )
    return CartOut(session_id=session_id, items=lines, totals=totals)


async def add_item(
    db: AsyncSession, guest: GuestIdentity, menu_item_id: UUID, quantity: int, note: str | None
) -> None:
    await get_open_session(db, guest.session_id)
    item = await db.get(MenuItem, menu_item_id)  # RLS hides other restaurants' items
    if item is None:
        raise NotFound("Menu item not found")
    if not item.is_available:
        raise Conflict(f"{item.name} is currently unavailable")

    note = (note or "").strip() or None
    existing = await db.scalar(
        select(CartItem).where(
            CartItem.session_id == guest.session_id,
            CartItem.menu_item_id == menu_item_id,
            CartItem.guest_id == guest.guest_id,
            CartItem.note.is_(None) if note is None else CartItem.note == note,
        )
    )
    if existing:
        existing.quantity = min(existing.quantity + quantity, 50)
    else:
        db.add(
            CartItem(
                restaurant_id=guest.restaurant_id,
                session_id=guest.session_id,
                menu_item_id=menu_item_id,
                quantity=quantity,
                note=note,
                guest_id=guest.guest_id,
                guest_name=guest.guest_name,
            )
        )
    await db.flush()


async def _get_line(db: AsyncSession, session_id: UUID, cart_item_id: UUID) -> CartItem:
    line = await db.scalar(
        select(CartItem).where(CartItem.id == cart_item_id, CartItem.session_id == session_id)
    )
    if line is None:
        raise NotFound("Cart item not found")
    return line


async def update_quantity(
    db: AsyncSession, guest: GuestIdentity, cart_item_id: UUID, quantity: int
) -> None:
    # Shared cart: anyone at the table may edit any line (last write wins).
    await get_open_session(db, guest.session_id)
    line = await _get_line(db, guest.session_id, cart_item_id)
    line.quantity = quantity
    await db.flush()


async def remove_item(db: AsyncSession, guest: GuestIdentity, cart_item_id: UUID) -> None:
    await get_open_session(db, guest.session_id)
    line = await _get_line(db, guest.session_id, cart_item_id)
    await db.delete(line)
    await db.flush()
