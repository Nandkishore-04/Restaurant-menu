"""Kitchen / floor order management."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import Pub, require_member
from app.db.session import tenant_session
from app.models import OrderStatus
from app.schemas.ordering import OrderOut, OrderStatusUpdate
from app.services import orders as order_svc
from app.services.realtime import restaurant_channel, session_channel

router = APIRouter(
    prefix="/v1/restaurants/{restaurant_id}/orders",
    tags=["orders"],
    dependencies=[Depends(require_member())],
)


@router.get("", response_model=list[OrderOut])
async def list_orders(
    restaurant_id: UUID,
    status: Annotated[list[OrderStatus] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[OrderOut]:
    async with tenant_session(restaurant_id) as db:
        orders = await order_svc.list_orders(db, statuses=status, limit=limit)
        return await order_svc.to_out(db, orders)


@router.patch("/{order_id}", response_model=OrderOut)
async def update_status(
    restaurant_id: UUID, order_id: UUID, body: OrderStatusUpdate, pub: Pub
) -> OrderOut:
    async with tenant_session(restaurant_id) as db:
        order = await order_svc.change_status(db, order_id, body.status)
        [out] = await order_svc.to_out(db, [order])
    payload = {"order_id": str(order.id), "status": order.status.value}
    await pub.publish(session_channel(order.session_id), "order_status", payload)
    await pub.publish(restaurant_channel(restaurant_id), "order_status", payload)
    return out
