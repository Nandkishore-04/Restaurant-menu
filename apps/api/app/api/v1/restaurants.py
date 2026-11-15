"""Restaurant onboarding, tables and table sessions (staff only)."""

import secrets
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import FLOOR_STAFF, MENU_EDITORS, Pub, Staff, require_member
from app.core.config import get_settings
from app.db.session import system_session, tenant_session
from app.models import (
    CartItem,
    DiningTable,
    MemberRole,
    Restaurant,
    RestaurantMember,
    SessionStatus,
    TableSession,
)
from app.schemas.restaurant import (
    MyRestaurantOut,
    RestaurantCreate,
    RestaurantOut,
    TableCreate,
    TableOut,
)
from app.services.errors import Conflict, NotFound
from app.services.realtime import session_channel

router = APIRouter(prefix="/v1", tags=["restaurants"])


def _table_out(table: DiningTable) -> TableOut:
    return TableOut.model_validate(
        {
            **{c: getattr(table, c) for c in ("id", "label", "seats", "is_active", "qr_token")},
            "qr_url": f"{get_settings().public_web_url}/t/{table.qr_token}",
        }
    )


@router.post("/restaurants", response_model=RestaurantOut, status_code=status.HTTP_201_CREATED)
async def create_restaurant(body: RestaurantCreate, staff: Staff) -> Restaurant:
    """Self-serve onboarding: the caller becomes the owner."""
    try:
        async with system_session() as db:
            restaurant = Restaurant(**body.model_dump())
            db.add(restaurant)
            await db.flush()
            db.add(
                RestaurantMember(
                    restaurant_id=restaurant.id, user_id=staff.user_id, role=MemberRole.OWNER
                )
            )
            await db.flush()
            await db.refresh(restaurant)
    except IntegrityError as exc:
        raise Conflict("That restaurant URL (slug) is already taken") from exc
    return restaurant


@router.get("/me/restaurants", response_model=list[MyRestaurantOut])
async def my_restaurants(staff: Staff) -> list[MyRestaurantOut]:
    async with system_session() as db:
        rows = (
            await db.execute(
                select(Restaurant, RestaurantMember.role)
                .join(RestaurantMember, RestaurantMember.restaurant_id == Restaurant.id)
                .where(RestaurantMember.user_id == staff.user_id)
                .order_by(Restaurant.name)
            )
        ).all()
    return [
        MyRestaurantOut(restaurant=RestaurantOut.model_validate(r), role=role) for r, role in rows
    ]


@router.post(
    "/restaurants/{restaurant_id}/tables",
    response_model=TableOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member(MENU_EDITORS))],
)
async def create_table(restaurant_id: UUID, body: TableCreate) -> TableOut:
    try:
        async with tenant_session(restaurant_id) as db:
            table = DiningTable(
                restaurant_id=restaurant_id,
                label=body.label,
                seats=body.seats,
                qr_token=secrets.token_urlsafe(16),
            )
            db.add(table)
            await db.flush()
            await db.refresh(table)
    except IntegrityError as exc:
        raise Conflict(f"Table '{body.label}' already exists") from exc
    return _table_out(table)


@router.get(
    "/restaurants/{restaurant_id}/tables",
    response_model=list[TableOut],
    dependencies=[Depends(require_member())],
)
async def list_tables(restaurant_id: UUID) -> list[TableOut]:
    async with tenant_session(restaurant_id) as db:
        tables = (await db.scalars(select(DiningTable).order_by(DiningTable.label))).all()
    return [_table_out(t) for t in tables]


@router.post(
    "/restaurants/{restaurant_id}/table-sessions/{session_id}/close",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def close_session(
    restaurant_id: UUID,
    session_id: UUID,
    pub: Pub,
    _: Annotated[RestaurantMember, Depends(require_member(FLOOR_STAFF))],
) -> None:
    """Party has left: close the session so old guest tokens stop working."""
    async with tenant_session(restaurant_id) as db:
        session = await db.get(TableSession, session_id, with_for_update=True)
        if session is None:
            raise NotFound("Session not found")
        if session.status == SessionStatus.OPEN:
            session.status = SessionStatus.CLOSED
            session.closed_at = datetime.now(UTC)
            await db.execute(delete(CartItem).where(CartItem.session_id == session_id))
    await pub.publish(session_channel(session_id), "session_closed", {})
