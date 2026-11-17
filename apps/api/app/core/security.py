"""Authentication.

* Staff (owners, managers, kitchen) log in with Supabase Auth; we verify the Supabase JWT.
* Guests (customers) never log in. Scanning a table QR and joining returns a short-lived
  guest token signed by this API, scoped to one restaurant + one table session.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import UUID

import anyio
import jwt

from app.core.config import get_settings


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class StaffIdentity:
    user_id: UUID
    email: str | None


@dataclass(frozen=True)
class GuestIdentity:
    restaurant_id: UUID
    session_id: UUID
    guest_id: UUID
    guest_name: str


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    settings = get_settings()
    if not settings.supabase_url:
        raise AuthError("SUPABASE_URL is not configured")
    return jwt.PyJWKClient(
        f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True
    )


async def verify_staff_token(token: str) -> StaffIdentity:
    settings = get_settings()
    try:
        # Supabase signs with asymmetric keys (ES256/RS256, verified via the project's JWKS);
        # older projects and legacy keys use a shared HS256 secret. During key rotation a
        # project can issue both, so pick the method from the token's own header.
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise AuthError("HS256 tokens need SUPABASE_JWT_SECRET")
            claims = jwt.decode(
                token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
            )
        else:
            signing_key = await anyio.to_thread.run_sync(
                _jwks_client().get_signing_key_from_jwt, token
            )
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience="authenticated",
            )
        return StaffIdentity(user_id=UUID(claims["sub"]), email=claims.get("email"))
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise AuthError("Invalid staff token") from exc


def issue_guest_token(
    *, restaurant_id: UUID, session_id: UUID, guest_id: UUID, guest_name: str
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    claims = {
        "typ": "guest",
        "rid": str(restaurant_id),
        "sid": str(session_id),
        "gid": str(guest_id),
        "name": guest_name,
        "iat": now,
        "exp": now + timedelta(minutes=settings.guest_token_ttl_minutes),
    }
    return jwt.encode(claims, settings.guest_token_secret, algorithm="HS256")


def verify_guest_token(token: str) -> GuestIdentity:
    settings = get_settings()
    try:
        claims = jwt.decode(token, settings.guest_token_secret, algorithms=["HS256"])
        if claims.get("typ") != "guest":
            raise AuthError("Not a guest token")
        return GuestIdentity(
            restaurant_id=UUID(claims["rid"]),
            session_id=UUID(claims["sid"]),
            guest_id=UUID(claims["gid"]),
            guest_name=claims["name"],
        )
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise AuthError("Invalid guest token") from exc
