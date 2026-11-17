import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantScoped, Timestamps, UUIDPrimaryKey, str_enum
from app.models.enums import OrderStatus, PaymentMethod, PaymentStatus, SessionStatus


class TableSession(UUIDPrimaryKey, TenantScoped, Base):
    """One sitting at a table. Everyone who scans that table's QR joins the same session
    and shares its cart. Staff close it when the party leaves."""

    __tablename__ = "table_sessions"
    __table_args__ = (
        # At most one open session per table.
        Index(
            "uq_table_sessions_one_open_per_table",
            "table_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    table_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dining_tables.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[SessionStatus] = mapped_column(
        str_enum(SessionStatus), server_default=SessionStatus.OPEN.value
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CartItem(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    """A line in the shared table cart (not yet sent to the kitchen)."""

    __tablename__ = "cart_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("table_sessions.id", ondelete="CASCADE"), index=True
    )
    menu_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200))  # "less spicy"
    guest_id: Mapped[uuid.UUID]
    guest_name: Mapped[str] = mapped_column(String(40))


class Order(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    """A batch of items sent to the kitchen. A session can have several orders (rounds)."""

    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("restaurant_id", "order_number"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("table_sessions.id", ondelete="CASCADE"), index=True
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dining_tables.id", ondelete="CASCADE"), index=True
    )
    order_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[OrderStatus] = mapped_column(
        str_enum(OrderStatus), server_default=OrderStatus.PLACED.value, index=True
    )
    subtotal_paise: Mapped[int] = mapped_column(Integer)
    tax_paise: Mapped[int] = mapped_column(Integer)
    total_paise: Mapped[int] = mapped_column(Integer)
    placed_by_guest_id: Mapped[uuid.UUID]
    placed_by_name: Mapped[str] = mapped_column(String(40))


class OrderItem(UUIDPrimaryKey, TenantScoped, Base):
    """Snapshot of an item at order time, so later menu edits never change past orders."""

    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    menu_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(120))
    unit_price_paise: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total_paise: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200))
    guest_name: Mapped[str] = mapped_column(String(40))


class Payment(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    """A table's bill payment. Guests initiate it; staff confirm the money arrived."""

    __tablename__ = "payments"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("table_sessions.id", ondelete="CASCADE"), index=True
    )
    table_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dining_tables.id", ondelete="CASCADE"), index=True
    )
    method: Mapped[PaymentMethod] = mapped_column(str_enum(PaymentMethod))
    status: Mapped[PaymentStatus] = mapped_column(
        str_enum(PaymentStatus), server_default=PaymentStatus.PENDING.value, index=True
    )
    amount_paise: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str | None] = mapped_column(String(40))  # UPI transaction id (UTR)
    guest_id: Mapped[uuid.UUID]
    guest_name: Mapped[str] = mapped_column(String(40))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
