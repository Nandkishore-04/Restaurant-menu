import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantScoped, Timestamps, UUIDPrimaryKey, str_enum
from app.models.enums import Dietary


class MenuCategory(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    __tablename__ = "menu_categories"

    name: Mapped[str] = mapped_column(String(80))
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class MenuItem(UUIDPrimaryKey, TenantScoped, Timestamps, Base):
    __tablename__ = "menu_items"
    __table_args__ = (CheckConstraint("price_paise >= 0", name="price_non_negative"),)

    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    # Money is always integer minor units (paise) to avoid float rounding errors.
    price_paise: Mapped[int] = mapped_column(Integer)
    dietary: Mapped[Dietary] = mapped_column(str_enum(Dietary))
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_available: Mapped[bool] = mapped_column(Boolean, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
