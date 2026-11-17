"""Staff side of payments: see pending payments and confirm the money arrived."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import FLOOR_STAFF, Pub, require_member
from app.db.session import tenant_session
from app.models import PaymentStatus
from app.schemas.payments import PaymentDecision, PaymentOut
from app.services import payments as pay_svc
from app.services.realtime import restaurant_channel, session_channel

router = APIRouter(
    prefix="/v1/restaurants/{restaurant_id}/payments",
    tags=["payments"],
    dependencies=[Depends(require_member(FLOOR_STAFF))],
)


@router.get("", response_model=list[PaymentOut])
async def list_payments(
    restaurant_id: UUID,
    status: Annotated[list[PaymentStatus] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[PaymentOut]:
    async with tenant_session(restaurant_id) as db:
        return await pay_svc.list_payments(db, status, limit)


@router.post("/{payment_id}/decision", response_model=PaymentOut)
async def decide(
    restaurant_id: UUID, payment_id: UUID, body: PaymentDecision, pub: Pub
) -> PaymentOut:
    async with tenant_session(restaurant_id) as db:
        payment = await pay_svc.decide(db, payment_id, body.status)
        out = PaymentOut.model_validate(payment)
    payload = {"payment_id": str(payment.id), "status": payment.status.value}
    await pub.publish(session_channel(payment.session_id), "payment_updated", payload)
    await pub.publish(restaurant_channel(restaurant_id), "payment_updated", payload)
    return out
