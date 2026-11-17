import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core import security
from app.core.security import AuthError, verify_staff_token


def _es256_token(private_key, user_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "email": "a@b.in",
            "aud": "authenticated",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )


class _StubJwks:
    """Stands in for the project's JWKS endpoint."""

    def __init__(self, public_key) -> None:
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token: str):
        return type("SigningKey", (), {"key": self.public_key})()


async def test_asymmetric_supabase_tokens_verified_via_jwks(monkeypatch) -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(security, "_jwks_client", lambda: _StubJwks(key.public_key()))
    uid = uuid.uuid4()

    identity = await verify_staff_token(_es256_token(key, uid))
    assert identity.user_id == uid and identity.email == "a@b.in"

    # Signed by some other key: rejected.
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(AuthError):
        await verify_staff_token(_es256_token(other, uid))


async def test_unsigned_tokens_rejected() -> None:
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "authenticated"}, key=None, algorithm="none"
    )
    with pytest.raises(AuthError):
        await verify_staff_token(forged)
