import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantScoped, Timestamps, UUIDPrimaryKey, str_enum
from app.models.enums import MemberRole


class Restaurant(UUIDPrimaryKey, Timestamps, Base):
    """The tenant. Every other business table points at a restaurant."""

    __tablename__ = "restaurants"

    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    currency: Mapped[str] = mapped_column(String(3), server_default="INR")
    timezone: Mapped[str] = mapped_column(String(64), server_default="Asia/Kolkata")
    # GST in basis points: 500 = 5% (standard for standalone restaurants, no ITC).
    tax_rate_bps: Mapped[int] = mapped_column(Integer, server_default="500")
    prices_include_tax: Mapped[bool] = mapped_column(Boolean, server_default="false")
    # Where UPI payments go. When unset, guests see a clearly-marked demo QR.
    upi_vpa: Mapped[str | None] = mapped_column(String(100))
    upi_payee_name: Mapped[str | None] = mapped_column(String(100))
    # Per-restaurant running counter for human-friendly order numbers ("Order #42").
    order_seq: Mapped[int] = mapped_column(Integer, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class RestaurantMember(UUIDPrimaryKey, Timestamps, Base):
    """Links a Supabase auth user to a restaurant with a role."""

    __tablename__ = "restaurant_members"
    __table_args__ = (UniqueConstraint("restaurant_id", "user_id"),)

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(index=True)  # auth.users.id
    role: Mapped[MemberRole] = mapped_column(str_enum(MemberRole))
    # Copied from the auth token when they join, so owners can see who's who.
    email: Mapped[str | None] = mapped_column(String(254))


class DiningTable(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    __tablename__ = "dining_tables"
    __table_args__ = (UniqueConstraint("restaurant_id", "label"),)

    label: Mapped[str] = mapped_column(String(32))  # e.g. "T4", "Patio 2"
    seats: Mapped[int | None] = mapped_column(Integer)
    # Random, unguessable token printed in the QR code. Rotate it to invalidate old QRs.
    qr_token: Mapped[str] = mapped_column(String(64), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class RestaurantInvite(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    """A shareable join link (e.g. sent on WhatsApp). Whoever opens it while signed in
    joins the restaurant with `role`. Single use, expires."""

    __tablename__ = "restaurant_invites"

    token: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[MemberRole] = mapped_column(str_enum(MemberRole))
    email: Mapped[str | None] = mapped_column(String(254))  # who it's meant for (informational)
    created_by: Mapped[uuid.UUID]
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[uuid.UUID | None]
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlatformAdmin(Base):
    """SaaS operators (you), who can see and manage every restaurant. Not tenant data."""

    __tablename__ = "platform_admins"

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str | None] = mapped_column(String(254))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
