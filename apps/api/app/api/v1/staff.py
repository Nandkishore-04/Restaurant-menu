"""Staff & invites (restaurant admin) plus the invite-accept flow for new staff."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select

from app.api.deps import MENU_EDITORS, OWNERS, Staff, require_member
from app.db.session import system_session, tenant_session
from app.models import RestaurantInvite, RestaurantMember
from app.schemas.admin import (
    InviteAccepted,
    InviteCreate,
    InviteOut,
    InvitePreview,
    MemberOut,
    MemberUpdate,
)
from app.services import staff as staff_svc
from app.services.errors import NotFound

router = APIRouter(prefix="/v1", tags=["staff"])
Owner = Annotated[RestaurantMember, Depends(require_member(OWNERS))]


@router.get(
    "/restaurants/{restaurant_id}/members",
    response_model=list[MemberOut],
    dependencies=[Depends(require_member(MENU_EDITORS))],
)
async def list_members(restaurant_id: UUID, staff: Staff) -> list[MemberOut]:
    async with tenant_session(restaurant_id) as db:
        members = (
            await db.scalars(select(RestaurantMember).order_by(RestaurantMember.created_at))
        ).all()
    return [
        MemberOut.model_validate(m).model_copy(update={"is_you": m.user_id == staff.user_id})
        for m in members
    ]


@router.patch("/restaurants/{restaurant_id}/members/{member_id}", response_model=MemberOut)
async def update_member(
    restaurant_id: UUID, member_id: UUID, body: MemberUpdate, _: Owner
) -> MemberOut:
    async with tenant_session(restaurant_id) as db:
        member = await staff_svc.change_role(db, member_id, body.role)
        return MemberOut.model_validate(member)


@router.delete(
    "/restaurants/{restaurant_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_member(restaurant_id: UUID, member_id: UUID, _: Owner) -> Response:
    async with tenant_session(restaurant_id) as db:
        await staff_svc.remove_member(db, member_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/restaurants/{restaurant_id}/invites", response_model=list[InviteOut])
async def list_invites(restaurant_id: UUID, _: Owner) -> list[InviteOut]:
    """Open invites only (not used, not cancelled, not expired)."""
    async with tenant_session(restaurant_id) as db:
        invites = (
            await db.scalars(
                select(RestaurantInvite)
                .where(
                    RestaurantInvite.accepted_at.is_(None),
                    RestaurantInvite.revoked_at.is_(None),
                    RestaurantInvite.expires_at > datetime.now(UTC),
                )
                .order_by(RestaurantInvite.created_at.desc())
            )
        ).all()
    return [staff_svc.invite_out(i) for i in invites]


@router.post(
    "/restaurants/{restaurant_id}/invites",
    response_model=InviteOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    restaurant_id: UUID, body: InviteCreate, staff: Staff, _: Owner
) -> InviteOut:
    async with tenant_session(restaurant_id) as db:
        invite = await staff_svc.create_invite(db, restaurant_id, staff, body.role, body.email)
        return staff_svc.invite_out(invite)


@router.delete(
    "/restaurants/{restaurant_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_invite(restaurant_id: UUID, invite_id: UUID, _: Owner) -> Response:
    async with tenant_session(restaurant_id) as db:
        invite = await db.get(RestaurantInvite, invite_id)
        if invite is None:
            raise NotFound("Invite not found")
        invite.revoked_at = datetime.now(UTC)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invites/{token}", response_model=InvitePreview)
async def preview_invite(token: str) -> InvitePreview:
    """Shown on the join page before signing in: which restaurant, which role."""
    async with system_session() as db:
        return await staff_svc.preview_invite(db, token)


@router.post("/invites/{token}/accept", response_model=InviteAccepted)
async def accept_invite(token: str, staff: Staff) -> InviteAccepted:
    async with system_session() as db:
        invite = await staff_svc.accept_invite(db, token, staff)
        return InviteAccepted(restaurant_id=invite.restaurant_id, role=invite.role)
