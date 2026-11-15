from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import Dietary
from app.schemas.common import ORMModel


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sort_order: int | None = None  # default: append at the end


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    is_active: bool | None = None


class ReorderIn(BaseModel):
    """Full list of ids in the desired display order."""

    ids: list[UUID] = Field(min_length=1, max_length=500)


class MenuItemCreate(BaseModel):
    category_id: UUID
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    price_paise: int = Field(ge=0)
    dietary: Dietary
    image_url: str | None = Field(default=None, max_length=500)
    is_available: bool = True
    sort_order: int | None = None  # default: append at the end of its category


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    price_paise: int | None = Field(default=None, ge=0)
    dietary: Dietary | None = None
    image_url: str | None = Field(default=None, max_length=500)
    is_available: bool | None = None
    sort_order: int | None = None
    category_id: UUID | None = None


class MenuItemOut(ORMModel):
    id: UUID
    category_id: UUID
    name: str
    description: str | None
    price_paise: int
    dietary: Dietary
    image_url: str | None
    is_available: bool
    sort_order: int


class CategoryOut(ORMModel):
    id: UUID
    name: str
    sort_order: int
    is_active: bool
    items: list[MenuItemOut] = []


class PublicMenuOut(BaseModel):
    restaurant_name: str
    restaurant_slug: str
    logo_url: str | None
    currency: str
    table_label: str
    categories: list[CategoryOut]
