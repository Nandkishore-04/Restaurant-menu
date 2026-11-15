"""Menu management (owner/manager)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import MENU_EDITORS, require_member
from app.db.session import tenant_session
from app.models import MenuCategory, MenuItem
from app.schemas.menu import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    MenuItemCreate,
    MenuItemOut,
    MenuItemUpdate,
    ReorderIn,
)
from app.services.errors import Conflict, DomainError, NotFound

router = APIRouter(
    prefix="/v1/restaurants/{restaurant_id}/menu",
    tags=["menu"],
    dependencies=[Depends(require_member(MENU_EDITORS))],
)


async def _menu(db: AsyncSession) -> list[CategoryOut]:
    cats = (
        await db.scalars(
            select(MenuCategory).order_by(MenuCategory.sort_order, MenuCategory.created_at)
        )
    ).all()
    items = (
        await db.scalars(select(MenuItem).order_by(MenuItem.sort_order, MenuItem.created_at))
    ).all()
    return [
        CategoryOut.model_validate(c).model_copy(
            update={
                "items": [MenuItemOut.model_validate(i) for i in items if i.category_id == c.id]
            }
        )
        for c in cats
    ]


async def _get_category(db: AsyncSession, category_id: UUID) -> MenuCategory:
    cat = await db.get(MenuCategory, category_id)  # RLS: only this restaurant's rows
    if cat is None:
        raise NotFound("Category not found")
    return cat


async def _get_item(db: AsyncSession, item_id: UUID) -> MenuItem:
    item = await db.get(MenuItem, item_id)
    if item is None:
        raise NotFound("Menu item not found")
    return item


async def _apply_order(rows: list, ids: list[UUID]) -> None:
    by_id = {r.id: r for r in rows}
    if len(ids) != len(set(ids)) or set(ids) != set(by_id):
        raise DomainError("The order must list every id exactly once")
    for index, row_id in enumerate(ids):
        by_id[row_id].sort_order = index


@router.get("", response_model=list[CategoryOut])
async def get_full_menu(restaurant_id: UUID) -> list[CategoryOut]:
    """Everything, including hidden categories and sold-out items."""
    async with tenant_session(restaurant_id) as db:
        return await _menu(db)


# --- Categories -------------------------------------------------------------


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(restaurant_id: UUID, body: CategoryCreate) -> MenuCategory:
    async with tenant_session(restaurant_id) as db:
        sort = body.sort_order
        if sort is None:
            sort = (await db.scalar(select(func.max(MenuCategory.sort_order)))) or 0
            sort += 1
        cat = MenuCategory(restaurant_id=restaurant_id, name=body.name.strip(), sort_order=sort)
        db.add(cat)
        await db.flush()
        await db.refresh(cat)
    return cat


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    restaurant_id: UUID, category_id: UUID, body: CategoryUpdate
) -> MenuCategory:
    async with tenant_session(restaurant_id) as db:
        cat = await _get_category(db, category_id)
        for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
            setattr(cat, field, value.strip() if isinstance(value, str) else value)
        await db.flush()
        await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(restaurant_id: UUID, category_id: UUID) -> Response:
    async with tenant_session(restaurant_id) as db:
        cat = await _get_category(db, category_id)
        count = await db.scalar(
            select(func.count()).select_from(MenuItem).where(MenuItem.category_id == cat.id)
        )
        if count:
            raise Conflict("Move or delete the dishes in this category first")
        await db.delete(cat)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/categories/order", response_model=list[CategoryOut])
async def reorder_categories(restaurant_id: UUID, body: ReorderIn) -> list[CategoryOut]:
    async with tenant_session(restaurant_id) as db:
        await _apply_order(list((await db.scalars(select(MenuCategory))).all()), body.ids)
        await db.flush()
        return await _menu(db)


@router.put("/categories/{category_id}/items/order", response_model=list[CategoryOut])
async def reorder_items(
    restaurant_id: UUID, category_id: UUID, body: ReorderIn
) -> list[CategoryOut]:
    async with tenant_session(restaurant_id) as db:
        await _get_category(db, category_id)
        items = (
            await db.scalars(select(MenuItem).where(MenuItem.category_id == category_id))
        ).all()
        await _apply_order(list(items), body.ids)
        await db.flush()
        return await _menu(db)


# --- Items ------------------------------------------------------------------


@router.post("/items", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(restaurant_id: UUID, body: MenuItemCreate) -> MenuItem:
    async with tenant_session(restaurant_id) as db:
        await _get_category(db, body.category_id)
        data = body.model_dump()
        if data["sort_order"] is None:
            last = await db.scalar(
                select(func.max(MenuItem.sort_order)).where(
                    MenuItem.category_id == body.category_id
                )
            )
            data["sort_order"] = (last or 0) + 1
        item = MenuItem(restaurant_id=restaurant_id, **data)
        db.add(item)
        await db.flush()
        await db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=MenuItemOut)
async def update_item(restaurant_id: UUID, item_id: UUID, body: MenuItemUpdate) -> MenuItem:
    async with tenant_session(restaurant_id) as db:
        item = await _get_item(db, item_id)
        changes = body.model_dump(exclude_unset=True)
        if changes.get("category_id") is not None:
            await _get_category(db, changes["category_id"])
        for field in ("name", "price_paise", "dietary", "is_available", "category_id"):
            if field in changes and changes[field] is None:
                del changes[field]  # these columns can't be cleared
        for field, value in changes.items():
            setattr(item, field, value)
        await db.flush()
        await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(restaurant_id: UUID, item_id: UUID) -> Response:
    """Past orders keep their own snapshot of the dish, so deleting is safe."""
    async with tenant_session(restaurant_id) as db:
        await db.delete(await _get_item(db, item_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
