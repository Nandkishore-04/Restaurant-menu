from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.security import (
    AuthError,
    GuestIdentity,
    StaffIdentity,
    verify_guest_token,
    verify_staff_token,
)
from app.db.session import system_session
from app.models import MemberRole, PlatformAdmin, RestaurantMember
from app.services.realtime import Publisher

_bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


async def current_staff(creds: Credentials) -> StaffIdentity:
    if creds is None:
        raise _unauthorized("Missing staff token")
    try:
        return await verify_staff_token(creds.credentials)
    except AuthError as exc:
        raise _unauthorized(str(exc)) from exc


async def current_guest(creds: Credentials) -> GuestIdentity:
    if creds is None:
        raise _unauthorized("Missing guest token")
    try:
        return verify_guest_token(creds.credentials)
    except AuthError as exc:
        raise _unauthorized(str(exc)) from exc


def get_publisher(request: Request) -> Publisher:
    return request.app.state.publisher


Staff = Annotated[StaffIdentity, Depends(current_staff)]
Guest = Annotated[GuestIdentity, Depends(current_guest)]
Pub = Annotated[Publisher, Depends(get_publisher)]

ALL_ROLES = frozenset(MemberRole)
MENU_EDITORS = frozenset({MemberRole.OWNER, MemberRole.MANAGER})
FLOOR_STAFF = frozenset({MemberRole.OWNER, MemberRole.MANAGER, MemberRole.STAFF})
OWNERS = frozenset({MemberRole.OWNER})


def require_member(
    roles: frozenset[MemberRole] = ALL_ROLES,
) -> Callable[..., Awaitable[RestaurantMember]]:
    """Dependency: caller must be a member of {restaurant_id} with one of `roles`."""

    async def dependency(restaurant_id: UUID, staff: Staff) -> RestaurantMember:
        async with system_session() as db:
            member = await db.scalar(
                select(RestaurantMember).where(
                    RestaurantMember.restaurant_id == restaurant_id,
                    RestaurantMember.user_id == staff.user_id,
                )
            )
        if member is None or member.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for this restaurant")
        return member

    return dependency


async def require_platform_admin(staff: Staff) -> StaffIdentity:
    """Dependency: caller must be a SaaS operator (row in platform_admins)."""
    async with system_session() as db:
        admin = await db.get(PlatformAdmin, staff.user_id)
    if admin is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform admins only")
    return staff


PlatformAdminUser = Annotated[StaffIdentity, Depends(require_platform_admin)]
