from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import MENU_EDITORS, require_member
from app.db.session import tenant_session
from app.models import Restaurant
from app.schemas.admin import OverviewStats
from app.services import stats as stats_svc

router = APIRouter(prefix="/v1/restaurants/{restaurant_id}", tags=["overview"])


@router.get(
    "/overview",
    response_model=OverviewStats,
    dependencies=[Depends(require_member(MENU_EDITORS))],
)
async def overview(
    restaurant_id: UUID, days: Annotated[int, Query(ge=1, le=90)] = 7
) -> OverviewStats:
    async with tenant_session(restaurant_id) as db:
        tz = (await db.execute(select(Restaurant.timezone))).scalar_one()
        return await stats_svc.overview(db, tz, days)
