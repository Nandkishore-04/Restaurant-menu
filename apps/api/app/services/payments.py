"""Bills and payments for a table session.

Flow: guest opens the bill -> chooses UPI (scans QR / opens their UPI app, then taps
"I've paid") or cash -> a *pending* payment is recorded -> staff confirm the money
arrived (or reject it). We never treat a guest's claim as proof of payment.
"""

from datetime import UTC, datetime
from urllib.parse import quote, urlencode
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import GuestIdentity
from app.models import (
    DiningTable,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Restaurant,
    TableSession,
)
from app.schemas.payments import BillLine, BillOut, PaymentOut, UpiInfo
from app.services.errors import Conflict, DomainError, NotFound
from app.services.sessions import get_open_session

# Uses a non-existent UPI handle on purpose: UPI apps reject it, so a demo QR can never
# send real money to a stranger.
DEMO_VPA = "demo.restaurant@example"


def upi_info(restaurant: Restaurant, amount_paise: int, note: str) -> UpiInfo:
    vpa = restaurant.upi_vpa or DEMO_VPA
    payee = restaurant.upi_payee_name or restaurant.name
    params = {
        "pa": vpa,
        "pn": payee,
        "am": f"{amount_paise / 100:.2f}",
        "cu": restaurant.currency,
        "tn": note,
    }
    uri = "upi://pay?" + urlencode(params, quote_via=quote)
    return UpiInfo(vpa=vpa, payee_name=payee, uri=uri, is_demo=restaurant.upi_vpa is None)


async def get_bill(db: AsyncSession, session: TableSession) -> BillOut:
    restaurant = (await db.execute(select(Restaurant))).scalar_one()  # RLS: this tenant only
    table = await db.get(DiningTable, session.table_id)
    assert table is not None

    orders = (
        await db.scalars(
            select(Order)
            .where(Order.session_id == session.id, Order.status != OrderStatus.CANCELLED)
            .order_by(Order.created_at)
        )
    ).all()
    items = (
        (
            await db.scalars(
                select(OrderItem)
                .where(OrderItem.order_id.in_([o.id for o in orders]))
                .order_by(OrderItem.order_id, OrderItem.name)
            )
        ).all()
        if orders
        else []
    )
    # Merge the same dish across rounds of ordering: "4 x Butter Naan".
    lines: dict[tuple[str, int], BillLine] = {}
    for it in items:
        k = (it.name, it.unit_price_paise)
        line = lines.get(k) or BillLine(
            name=it.name, unit_price_paise=it.unit_price_paise, quantity=0, amount_paise=0
        )
        line.quantity += it.quantity
        line.amount_paise += it.line_total_paise
        lines[k] = line

    payments = (
        await db.scalars(
            select(Payment).where(Payment.session_id == session.id).order_by(Payment.created_at)
        )
    ).all()
    total = sum(o.total_paise for o in orders)
    paid = sum(p.amount_paise for p in payments if p.status == PaymentStatus.PAID)
    due = max(total - paid, 0)
    pending = next((p for p in reversed(payments) if p.status == PaymentStatus.PENDING), None)
    return BillOut(
        session_id=session.id,
        restaurant_name=restaurant.name,
        table_label=table.label,
        currency=restaurant.currency,
        lines=list(lines.values()),
        order_count=len(orders),
        subtotal_paise=sum(o.subtotal_paise for o in orders),
        tax_paise=sum(o.tax_paise for o in orders),
        total_paise=total,
        paid_paise=paid,
        due_paise=due,
        pending_payment=PaymentOut.model_validate(pending) if pending else None,
        payments=[PaymentOut.model_validate(p) for p in payments],
        upi=upi_info(restaurant, due, f"Table {table.label} bill"),
    )


async def start_payment(
    db: AsyncSession, guest: GuestIdentity, method: PaymentMethod, reference: str | None
) -> Payment:
    session = await get_open_session(db, guest.session_id, lock=True)
    bill = await get_bill(db, session)
    if bill.due_paise <= 0:
        raise DomainError("There is nothing left to pay for this table.")

    pending = await db.scalar(
        select(Payment).where(
            Payment.session_id == session.id, Payment.status == PaymentStatus.PENDING
        )
    )
    if pending and pending.method == method:
        pending.amount_paise = bill.due_paise
        if reference:
            pending.reference = reference
        await db.flush()
        return pending
    if pending:
        pending.status = PaymentStatus.CANCELLED  # switched UPI <-> cash

    payment = Payment(
        restaurant_id=guest.restaurant_id,
        session_id=session.id,
        table_id=session.table_id,
        method=method,
        status=PaymentStatus.PENDING,
        amount_paise=bill.due_paise,
        reference=reference,
        guest_id=guest.guest_id,
        guest_name=guest.guest_name,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)
    return payment


async def decide(db: AsyncSession, payment_id: UUID, status: PaymentStatus) -> Payment:
    if status not in (PaymentStatus.PAID, PaymentStatus.REJECTED):
        raise DomainError("Status must be 'paid' or 'rejected'")
    payment = await db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
    if payment is None:
        raise NotFound("Payment not found")
    if payment.status != PaymentStatus.PENDING:
        raise Conflict(f"This payment is already {payment.status}")
    payment.status = status
    if status == PaymentStatus.PAID:
        payment.confirmed_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(payment)
    return payment


async def list_payments(
    db: AsyncSession, statuses: list[PaymentStatus] | None, limit: int
) -> list[PaymentOut]:
    stmt = (
        select(Payment, DiningTable.label)
        .join(DiningTable, DiningTable.id == Payment.table_id)
        .order_by(Payment.created_at.desc())
        .limit(limit)
    )
    if statuses:
        stmt = stmt.where(Payment.status.in_(statuses))
    rows = (await db.execute(stmt)).all()
    return [
        PaymentOut.model_validate(p).model_copy(update={"table_label": label}) for p, label in rows
    ]
