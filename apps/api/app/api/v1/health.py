from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import system_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    async with system_session() as db:
        await db.execute(text("SELECT 1"))
    return {"status": "ok"}
