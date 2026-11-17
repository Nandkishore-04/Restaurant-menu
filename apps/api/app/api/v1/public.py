"""Customer-facing endpoints. No login; a guest token is issued when joining a table."""

from uuid import UUID, uuid4

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import Guest, Pub
from app.core.security import issue_guest_token
from app.db.session import system_session, tenant_session
from app.models import MenuCategory, MenuItem
from app.schemas.menu import CategoryOut, MenuItemOut, PublicMenuOut
from app.schemas.ordering import (
    CartItemAdd,
    CartItemUpdate,
    CartOut,
    JoinSessionIn,
    JoinSessionOut,
    OrderOut,
)
from app.schemas.payments import BillOut, PaymentCreate, PaymentOut
from app.services import cart as cart_svc
from app.services import orders as order_svc
from app.services import payments as pay_svc
from app.services.realtime import restaurant_channel, session_channel
from app.services.sessions import get_open_session, get_or_open_session, resolve_qr_token

router = APIRouter(prefix="/v1/public", tags=["public"])


@router.get("/tables/{qr_token}/menu", response_model=PublicMenuOut)
async def get_menu(qr_token: str) -> PublicMenuOut:
    async with system_session() as db:
        restaurant, table = await resolve_qr_token(db, qr_token)
    async with tenant_session(restaurant.id) as db:
        categories = (
            await db.scalars(
                select(MenuCategory)
                .where(MenuCategory.is_active.is_(True))
                .order_by(MenuCategory.sort_order, MenuCategory.name)
            )
        ).all()
        items = (
            await db.scalars(select(MenuItem).order_by(MenuItem.sort_order, MenuItem.name))
        ).all()
    by_cat: dict[UUID, list[MenuItemOut]] = {}
    for item in items:
        by_cat.setdefault(item.category_id, []).append(MenuItemOut.model_validate(item))
    return PublicMenuOut(
        restaurant_name=restaurant.name,
        restaurant_slug=restaurant.slug,
        logo_url=restaurant.logo_url,
        currency=restaurant.currency,
        table_label=table.label,
        categories=[
            CategoryOut.model_validate(c).model_copy(update={"items": by_cat.get(c.id, [])})
            for c in categories
        ],
    )


@router.post(
    "/tables/{qr_token}/sessions",
    response_model=JoinSessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def join_table(qr_token: str, body: JoinSessionIn, pub: Pub) -> JoinSessionOut:
    async with system_session() as db:
        restaurant, table = await resolve_qr_token(db, qr_token)
    async with tenant_session(restaurant.id) as db:
        session = await get_or_open_session(db, table)
    guest_id = uuid4()
    guest_name = body.guest_name.strip()
    await pub.publish(
        session_channel(session.id), "guest_joined", {"guest_id": str(guest_id), "name": guest_name}
    )
    return JoinSessionOut(
        session_id=session.id,
        guest_id=guest_id,
        guest_token=issue_guest_token(
            restaurant_id=restaurant.id,
            session_id=session.id,
            guest_id=guest_id,
            guest_name=guest_name,
        ),
        realtime_channel=session_channel(session.id),
    )


@router.get("/session/cart", response_model=CartOut)
async def view_cart(guest: Guest) -> CartOut:
    async with tenant_session(guest.restaurant_id) as db:
        await get_open_session(db, guest.session_id)
        return await cart_svc.get_cart(db, guest.session_id)


async def _cart_changed(pub: Pub, guest: Guest) -> None:
    await pub.publish(
        session_channel(guest.session_id), "cart_updated", {"by": str(guest.guest_id)}
    )


@router.post("/session/cart/items", response_model=CartOut)
async def add_to_cart(body: CartItemAdd, guest: Guest, pub: Pub) -> CartOut:
    async with tenant_session(guest.restaurant_id) as db:
        await cart_svc.add_item(db, guest, body.menu_item_id, body.quantity, body.note)
        cart = await cart_svc.get_cart(db, guest.session_id)
    await _cart_changed(pub, guest)
    return cart


@router.patch("/session/cart/items/{cart_item_id}", response_model=CartOut)
async def update_cart_item(
    cart_item_id: UUID, body: CartItemUpdate, guest: Guest, pub: Pub
) -> CartOut:
    async with tenant_session(guest.restaurant_id) as db:
        await cart_svc.update_quantity(db, guest, cart_item_id, body.quantity)
        cart = await cart_svc.get_cart(db, guest.session_id)
    await _cart_changed(pub, guest)
    return cart


@router.delete("/session/cart/items/{cart_item_id}", response_model=CartOut)
async def remove_cart_item(cart_item_id: UUID, guest: Guest, pub: Pub) -> CartOut:
    async with tenant_session(guest.restaurant_id) as db:
        await cart_svc.remove_item(db, guest, cart_item_id)
        cart = await cart_svc.get_cart(db, guest.session_id)
    await _cart_changed(pub, guest)
    return cart


@router.post("/session/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def place_order(guest: Guest, pub: Pub) -> OrderOut:
    async with tenant_session(guest.restaurant_id) as db:
        order = await order_svc.place_order(db, guest)
        [out] = await order_svc.to_out(db, [order])
    payload = {"order_id": str(order.id), "order_number": order.order_number}
    await pub.publish(session_channel(guest.session_id), "order_placed", payload)
    await pub.publish(restaurant_channel(guest.restaurant_id), "order_created", payload)
    return out


@router.get("/session/orders", response_model=list[OrderOut])
async def my_table_orders(guest: Guest) -> list[OrderOut]:
    async with tenant_session(guest.restaurant_id) as db:
        orders = await order_svc.list_orders(db, session_id=guest.session_id)
        return await order_svc.to_out(db, orders)


@router.get("/session/bill", response_model=BillOut)
async def view_bill(guest: Guest) -> BillOut:
    async with tenant_session(guest.restaurant_id) as db:
        session = await get_open_session(db, guest.session_id)
        return await pay_svc.get_bill(db, session)


@router.post("/session/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def pay(body: PaymentCreate, guest: Guest, pub: Pub) -> PaymentOut:
    """Record that the table is paying (UPI done, or cash requested). Staff confirm it."""
    async with tenant_session(guest.restaurant_id) as db:
        payment = await pay_svc.start_payment(db, guest, body.method, body.reference)
        out = PaymentOut.model_validate(payment)
    payload = {"payment_id": str(payment.id), "method": payment.method.value}
    await pub.publish(session_channel(guest.session_id), "payment_updated", payload)
    await pub.publish(restaurant_channel(guest.restaurant_id), "payment_requested", payload)
    return out
