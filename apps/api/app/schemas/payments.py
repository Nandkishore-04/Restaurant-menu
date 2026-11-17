from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod, PaymentStatus
from app.schemas.common import ORMModel


class PaymentCreate(BaseModel):
    method: PaymentMethod
    # UPI transaction reference (UTR), optional: helps staff match the payment.
    reference: str | None = Field(default=None, pattern=r"^[A-Za-z0-9]{6,40}$")


class PaymentOut(ORMModel):
    id: UUID
    method: PaymentMethod
    status: PaymentStatus
    amount_paise: int
    reference: str | None
    guest_name: str
    created_at: datetime
    confirmed_at: datetime | None
    table_label: str | None = None


class BillLine(BaseModel):
    name: str
    unit_price_paise: int
    quantity: int
    amount_paise: int


class UpiInfo(BaseModel):
    vpa: str
    payee_name: str
    # upi://pay?... deep link; encode it as the QR and use it for app buttons.
    uri: str
    # True when the restaurant hasn't set its own UPI ID: no real money can move.
    is_demo: bool


class BillOut(BaseModel):
    session_id: UUID
    restaurant_name: str
    table_label: str
    currency: str
    lines: list[BillLine]
    order_count: int
    subtotal_paise: int
    tax_paise: int
    total_paise: int
    paid_paise: int
    due_paise: int
    pending_payment: PaymentOut | None
    payments: list[PaymentOut]
    upi: UpiInfo


class PaymentDecision(BaseModel):
    status: PaymentStatus = Field(description="paid or rejected")
