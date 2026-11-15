"""Live updates via Supabase Realtime *Broadcast*.

Design: realtime messages are only "something changed" signals carrying ids, never data.
Clients refetch from the API, which enforces auth. So a leaked channel name leaks nothing,
and the transport can be swapped later (own WebSockets + Redis) without touching clients' logic.

Channels:
  session:{session_id}     -> everyone at a table (cart_updated, order_placed, order_status, ...)
  restaurant:{restaurant_id} -> staff dashboards / kitchen screen (order_created, order_status)
"""

import logging
from typing import Any, Protocol
from uuid import UUID

import httpx

from app.core.config import Settings

log = logging.getLogger(__name__)


def session_channel(session_id: UUID) -> str:
    return f"session:{session_id}"


def restaurant_channel(restaurant_id: UUID) -> str:
    return f"restaurant:{restaurant_id}"


class Publisher(Protocol):
    async def publish(self, topic: str, event: str, payload: dict[str, Any]) -> None: ...


class NoopPublisher:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, dict[str, Any]]] = []

    async def publish(self, topic: str, event: str, payload: dict[str, Any]) -> None:
        self.sent.append((topic, event, payload))


class SupabaseBroadcastPublisher:
    def __init__(self, http: httpx.AsyncClient, supabase_url: str, service_key: str) -> None:
        self._http = http
        self._url = f"{supabase_url}/realtime/v1/api/broadcast"
        self._headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

    async def publish(self, topic: str, event: str, payload: dict[str, Any]) -> None:
        body = {"messages": [{"topic": topic, "event": event, "payload": payload}]}
        try:
            resp = await self._http.post(self._url, json=body, headers=self._headers)
            resp.raise_for_status()
        except httpx.HTTPError:
            # Never fail the request because a live update couldn't be sent;
            # clients also refetch on focus/reconnect.
            log.warning("realtime publish failed topic=%s event=%s", topic, event, exc_info=True)


def build_publisher(settings: Settings, http: httpx.AsyncClient) -> Publisher:
    if settings.supabase_url and settings.supabase_service_role_key:
        return SupabaseBroadcastPublisher(
            http, settings.supabase_url, settings.supabase_service_role_key
        )
    return NoopPublisher()
