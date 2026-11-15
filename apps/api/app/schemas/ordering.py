from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import OrderStatus
from app.schemas.common import ORMModel


class JoinSessionIn(BaseModel):
    guest_name: str = Field(min_length=1, max_length=40)


class JoinSessionOut(BaseModel):
    session_id: UUID
    guest_id: UUID
    guest_token: str
    # Supabase Realtime broadcast channel to subscribe to for live cart/order updates.
    realtime_channel: str


class CartItemAdd(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(default=1, ge=1, le=50)
    note: str | None = Field(default=None, max_length=200)


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=50)


class Totals(BaseModel):
    subtotal_paise: int
    tax_paise: int
    total_paise: int


class CartLineOut(BaseModel):
    id: UUID
    menu_item_id: UUID
    name: str
    unit_price_paise: int
    quantity: int
    line_total_paise: int
    note: str | None
    guest_id: UUID
    guest_name: str


class CartOut(BaseModel):
    session_id: UUID
    items: list[CartLineOut]
    totals: Totals


class OrderItemOut(ORMModel):
    id: UUID
    menu_item_id: UUID | None
    name: str
    unit_price_paise: int
    quantity: int
    line_total_paise: int
    note: str | None
    guest_name: str


class OrderOut(ORMModel):
    id: UUID
    order_number: int
    session_id: UUID
    table_id: UUID
    table_label: str | None = None
    status: OrderStatus
    subtotal_paise: int
    tax_paise: int
    total_paise: int
    placed_by_name: str
    created_at: datetime
    items: list[OrderItemOut] = []


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
