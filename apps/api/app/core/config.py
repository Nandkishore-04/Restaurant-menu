from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or apps/api/.env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["local", "test", "staging", "production"] = "local"

    # Postgres (Supabase). Must use the asyncpg driver: postgresql+asyncpg://...
    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres"
    # Set true when connecting through Supabase's transaction pooler (port 6543).
    database_use_pooler: bool = False

    # Supabase project
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    # Only for local/legacy projects that sign JWTs with a shared secret (HS256).
    # When unset, tokens are verified against the project's JWKS endpoint.
    supabase_jwt_secret: str | None = None

    # Guest (customer) tokens are issued by this API, not Supabase.
    guest_token_secret: str = Field(default="change-me-in-production-use-32+-chars", min_length=32)
    guest_token_ttl_minutes: int = 6 * 60

    # Customer-facing web app; used to build QR code URLs.
    public_web_url: str = "http://localhost:3000"
    # Staff dashboard; used to build invite links.
    dashboard_url: str = "http://localhost:3001"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
