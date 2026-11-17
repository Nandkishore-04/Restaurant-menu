import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import StaffIdentity
from app.models import MemberRole, Restaurant, RestaurantInvite, RestaurantMember
from app.schemas.admin import InviteOut, InvitePreview
from app.services.errors import Conflict, DomainError, Gone, NotFound

INVITE_TTL = timedelta(days=7)


def invite_link(invite: RestaurantInvite) -> str:
    return f"{get_settings().dashboard_url}/invite/{invite.token}"


def invite_out(invite: RestaurantInvite) -> InviteOut:
    return InviteOut.model_validate(invite).model_copy(update={"link": invite_link(invite)})


async def _owner_count(db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(RestaurantMember)
            .where(RestaurantMember.role == MemberRole.OWNER)
        )
        or 0
    )


async def change_role(db: AsyncSession, member_id: UUID, role: MemberRole) -> RestaurantMember:
    member = await db.get(RestaurantMember, member_id, with_for_update=True)
    if member is None:
        raise NotFound("Staff member not found")
    if member.role == MemberRole.OWNER and role != MemberRole.OWNER and await _owner_count(db) <= 1:
        raise Conflict("A restaurant needs at least one owner. Make someone else owner first.")
    member.role = role
    await db.flush()
    return member


async def remove_member(db: AsyncSession, member_id: UUID) -> None:
    member = await db.get(RestaurantMember, member_id, with_for_update=True)
    if member is None:
        raise NotFound("Staff member not found")
    if member.role == MemberRole.OWNER and await _owner_count(db) <= 1:
        raise Conflict("You can't remove the only owner.")
    await db.delete(member)


async def create_invite(
    db: AsyncSession, restaurant_id: UUID, by: StaffIdentity, role: MemberRole, email: str | None
) -> RestaurantInvite:
    invite = RestaurantInvite(
        restaurant_id=restaurant_id,
        token=secrets.token_urlsafe(24),
        role=role,
        email=email,
        created_by=by.user_id,
        expires_at=datetime.now(UTC) + INVITE_TTL,
    )
    db.add(invite)
    await db.flush()
    await db.refresh(invite)
    return invite


def _invalid_reason(invite: RestaurantInvite) -> str | None:
    if invite.revoked_at:
        return "This invite was cancelled."
    if invite.accepted_at:
        return "This invite has already been used."
    if invite.expires_at < datetime.now(UTC):
        return "This invite has expired. Ask for a new link."
    return None


async def preview_invite(db: AsyncSession, token: str) -> InvitePreview:
    """Cross-tenant lookup by secret token: runs in a system_session."""
    row = (
        await db.execute(
            select(RestaurantInvite, Restaurant.name)
            .join(Restaurant, Restaurant.id == RestaurantInvite.restaurant_id)
            .where(RestaurantInvite.token == token)
        )
    ).first()
    if row is None:
        raise NotFound("Invite not found")
    invite, name = row
    reason = _invalid_reason(invite)
    return InvitePreview(
        restaurant_name=name,
        role=invite.role,
        expires_at=invite.expires_at,
        valid=reason is None,
        reason=reason,
    )


async def accept_invite(db: AsyncSession, token: str, staff: StaffIdentity) -> RestaurantInvite:
    """Cross-tenant: runs in a system_session (the joiner isn't a member yet)."""
    invite = await db.scalar(
        select(RestaurantInvite).where(RestaurantInvite.token == token).with_for_update()
    )
    if invite is None:
        raise NotFound("Invite not found")
    if reason := _invalid_reason(invite):
        raise Gone(reason)
    existing = await db.scalar(
        select(RestaurantMember).where(
            RestaurantMember.restaurant_id == invite.restaurant_id,
            RestaurantMember.user_id == staff.user_id,
        )
    )
    if existing:
        raise Conflict("You're already part of this restaurant.")
    restaurant = await db.get(Restaurant, invite.restaurant_id)
    if restaurant is None or not restaurant.is_active:
        raise DomainError("This restaurant is not active.")
    db.add(
        RestaurantMember(
            restaurant_id=invite.restaurant_id,
            user_id=staff.user_id,
            role=invite.role,
            email=staff.email,
        )
    )
    invite.accepted_by = staff.user_id
    invite.accepted_at = datetime.now(UTC)
    await db.flush()
    return invite
