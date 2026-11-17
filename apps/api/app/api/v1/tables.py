"""Table management for the restaurant admin: live status, edit, rotate QR."""

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError

from app.api.deps import FLOOR_STAFF, MENU_EDITORS, require_member
from app.db.session import tenant_session
from app.models import DiningTable
from app.schemas.admin import LiveTable, TableUpdate
from app.schemas.restaurant import TableOut
from app.services import tables as table_svc
from app.services.errors import Conflict, NotFound

router = APIRouter(prefix="/v1/restaurants/{restaurant_id}/tables", tags=["tables"])


def _out(t: DiningTable) -> TableOut:
    return TableOut(
        id=t.id,
        label=t.label,
        seats=t.seats,
        is_active=t.is_active,
        qr_token=t.qr_token,
        qr_url=table_svc.qr_url(t),
    )


@router.get(
    "/live", response_model=list[LiveTable], dependencies=[Depends(require_member(FLOOR_STAFF))]
)
async def live_tables(restaurant_id: UUID) -> list[LiveTable]:
    async with tenant_session(restaurant_id) as db:
        return await table_svc.live_tables(db)


@router.patch(
    "/{table_id}", response_model=TableOut, dependencies=[Depends(require_member(MENU_EDITORS))]
)
async def update_table(restaurant_id: UUID, table_id: UUID, body: TableUpdate) -> TableOut:
    try:
        async with tenant_session(restaurant_id) as db:
            table = await db.get(DiningTable, table_id)
            if table is None:
                raise NotFound("Table not found")
            for field, value in body.model_dump(exclude_unset=True).items():
                if value is not None or field == "seats":
                    setattr(table, field, value)
            await db.flush()
            await db.refresh(table)
    except IntegrityError as exc:
        raise Conflict(f"Another table is already called '{body.label}'") from exc
    return _out(table)


@router.post(
    "/{table_id}/rotate-qr",
    response_model=TableOut,
    dependencies=[Depends(require_member(MENU_EDITORS))],
)
async def rotate_qr(restaurant_id: UUID, table_id: UUID) -> TableOut:
    """Issue a new QR code; the old printed one stops working (e.g. it was photographed)."""
    async with tenant_session(restaurant_id) as db:
        table = await db.get(DiningTable, table_id)
        if table is None:
            raise NotFound("Table not found")
        table.qr_token = secrets.token_urlsafe(16)
        await db.flush()
        await db.refresh(table)
    return _out(table)
