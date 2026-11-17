"""Schemas for the restaurant admin portal and the platform admin portal."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import MemberRole
from app.schemas.common import ORMModel

# --- Tables -----------------------------------------------------------------


class TableUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=32)
    seats: int | None = Field(default=None, ge=1, le=100)
    is_active: bool | None = None


class LiveSession(BaseModel):
    id: UUID
    opened_at: datetime
    order_count: int
    total_paise: int
    paid_paise: int
    due_paise: int
    payment_pending: bool
    cart_items: int


class LiveTable(BaseModel):
    id: UUID
    label: str
    seats: int | None
    is_active: bool
    qr_token: str
    qr_url: str
    session: LiveSession | None


# --- Staff ------------------------------------------------------------------


class MemberOut(ORMModel):
    id: UUID
    user_id: UUID
    email: str | None
    role: MemberRole
    created_at: datetime
    is_you: bool = False


class MemberUpdate(BaseModel):
    role: MemberRole


class InviteCreate(BaseModel):
    role: MemberRole
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class InviteOut(ORMModel):
    id: UUID
    role: MemberRole
    email: str | None
    expires_at: datetime
    created_at: datetime
    link: str = ""


class InvitePreview(BaseModel):
    restaurant_name: str
    role: MemberRole
    expires_at: datetime
    valid: bool
    reason: str | None = None


class InviteAccepted(BaseModel):
    restaurant_id: UUID
    role: MemberRole


# --- Overview stats ---------------------------------------------------------


class DayPoint(BaseModel):
    day: date
    revenue_paise: int
    orders: int


class TopDish(BaseModel):
    name: str
    quantity: int
    revenue_paise: int


class OverviewStats(BaseModel):
    today_revenue_paise: int
    today_orders: int
    yesterday_revenue_paise: int
    yesterday_orders: int
    avg_order_paise: int
    collected_today_paise: int
    pending_payments: int
    open_tables: int
    total_tables: int
    live_orders: dict[str, int]
    series: list[DayPoint]
    top_dishes: list[TopDish]


# --- Platform admin ---------------------------------------------------------


class PlatformStats(BaseModel):
    restaurants: int
    active_restaurants: int
    new_restaurants_30d: int
    orders_today: int
    gmv_today_paise: int
    orders_30d: int
    gmv_30d_paise: int
    open_tables: int
    series: list[DayPoint]


class PlatformRestaurant(BaseModel):
    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    owner_email: str | None
    tables: int
    staff: int
    orders_30d: int
    gmv_30d_paise: int
    last_order_at: datetime | None
    upi_configured: bool


class PlatformRestaurantUpdate(BaseModel):
    is_active: bool
