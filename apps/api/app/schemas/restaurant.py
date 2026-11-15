from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import MemberRole
from app.schemas.common import ORMModel


class RestaurantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    tax_rate_bps: int = Field(default=500, ge=0, le=2800)
    prices_include_tax: bool = False


class RestaurantOut(ORMModel):
    id: UUID
    slug: str
    name: str
    logo_url: str | None
    currency: str
    tax_rate_bps: int
    prices_include_tax: bool
    is_active: bool


class MyRestaurantOut(BaseModel):
    restaurant: RestaurantOut
    role: MemberRole


class TableCreate(BaseModel):
    label: str = Field(min_length=1, max_length=32)
    seats: int | None = Field(default=None, ge=1, le=100)


class TableOut(ORMModel):
    id: UUID
    label: str
    seats: int | None
    is_active: bool
    qr_token: str
    qr_url: str
