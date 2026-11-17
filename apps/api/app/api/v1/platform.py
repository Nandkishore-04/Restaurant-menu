"""Platform admin (SaaS operator) API: every restaurant, platform-wide numbers."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import Staff, require_platform_admin
from app.db.session import system_session
from app.models import PlatformAdmin
from app.schemas.admin import PlatformRestaurant, PlatformRestaurantUpdate, PlatformStats
from app.services import platform as platform_svc

router = APIRouter(prefix="/v1/platform", tags=["platform"])
admin_only = [Depends(require_platform_admin)]


class PlatformMe(BaseModel):
    is_platform_admin: bool


@router.get("/me", response_model=PlatformMe)
async def me(staff: Staff) -> PlatformMe:
    """Lets the dashboard decide whether to show the platform admin link."""
    async with system_session() as db:
        return PlatformMe(is_platform_admin=await db.get(PlatformAdmin, staff.user_id) is not None)


@router.get("/stats", response_model=PlatformStats, dependencies=admin_only)
async def stats(days: Annotated[int, Query(ge=7, le=90)] = 14) -> PlatformStats:
    async with system_session() as db:
        return await platform_svc.stats(db, days)


@router.get("/restaurants", response_model=list[PlatformRestaurant], dependencies=admin_only)
async def restaurants(
    search: Annotated[str, Query(max_length=100)] = "",
) -> list[PlatformRestaurant]:
    async with system_session() as db:
        return await platform_svc.restaurants(db, search.strip())


@router.patch(
    "/restaurants/{restaurant_id}", response_model=PlatformRestaurant, dependencies=admin_only
)
async def update_restaurant(
    restaurant_id: UUID, body: PlatformRestaurantUpdate
) -> PlatformRestaurant:
    """Suspend or reactivate. Suspended restaurants' QR codes stop accepting guests."""
    async with system_session() as db:
        r = await platform_svc.set_active(db, restaurant_id, body.is_active)
        rows = await platform_svc.restaurants(db, r.slug)
    return next(x for x in rows if x.id == restaurant_id)
