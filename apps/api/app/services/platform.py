"""SaaS-operator views across ALL restaurants. Runs in system_session (bypasses RLS) and
is only reachable through require_platform_admin."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Restaurant
from app.schemas.admin import DayPoint, PlatformRestaurant, PlatformStats
from app.services.errors import NotFound

# Platform-wide days are counted in IST: the product targets India.
TZ = "Asia/Kolkata"
_TODAY = "(now() AT TIME ZONE :tz)::date"


async def stats(db: AsyncSession, days: int = 14) -> PlatformStats:
    p = {"tz": TZ, "days": days}
    r = (
        await db.execute(
            text(f"""
            SELECT
              (SELECT count(*) FROM restaurants),
              (SELECT count(*) FROM restaurants WHERE is_active),
              (SELECT count(*) FROM restaurants WHERE created_at > now() - interval '30 days'),
              (SELECT count(*) FROM orders WHERE status <> 'cancelled'
                 AND (created_at AT TIME ZONE :tz)::date = {_TODAY}),
              (SELECT coalesce(sum(total_paise), 0) FROM orders WHERE status <> 'cancelled'
                 AND (created_at AT TIME ZONE :tz)::date = {_TODAY}),
              (SELECT count(*) FROM orders WHERE status <> 'cancelled'
                 AND created_at > now() - interval '30 days'),
              (SELECT coalesce(sum(total_paise), 0) FROM orders WHERE status <> 'cancelled'
                 AND created_at > now() - interval '30 days'),
              (SELECT count(*) FROM table_sessions WHERE status = 'open')
            """),
            p,
        )
    ).one()
    series = (
        await db.execute(
            text(f"""
            SELECT g::date AS day, coalesce(sum(o.total_paise), 0) AS revenue,
                   count(o.id) AS orders
            FROM generate_series({_TODAY} - (:days - 1), {_TODAY}, interval '1 day') g
            LEFT JOIN orders o
              ON (o.created_at AT TIME ZONE :tz)::date = g::date AND o.status <> 'cancelled'
            GROUP BY g ORDER BY g
            """),
            p,
        )
    ).all()
    return PlatformStats(
        restaurants=r[0],
        active_restaurants=r[1],
        new_restaurants_30d=r[2],
        orders_today=r[3],
        gmv_today_paise=r[4],
        orders_30d=r[5],
        gmv_30d_paise=r[6],
        open_tables=r[7],
        series=[DayPoint(day=s.day, revenue_paise=s.revenue, orders=s.orders) for s in series],
    )


async def restaurants(db: AsyncSession, search: str = "") -> list[PlatformRestaurant]:
    rows = (
        (
            await db.execute(
                text("""
            SELECT r.id, r.name, r.slug, r.is_active, r.created_at,
                   r.upi_vpa IS NOT NULL AS upi_configured,
                   (SELECT m.email FROM restaurant_members m
                     WHERE m.restaurant_id = r.id AND m.role = 'owner'
                     ORDER BY m.created_at LIMIT 1) AS owner_email,
                   (SELECT count(*) FROM dining_tables t WHERE t.restaurant_id = r.id) AS tables,
                   (SELECT count(*) FROM restaurant_members m
                     WHERE m.restaurant_id = r.id) AS staff,
                   coalesce(o.orders_30d, 0) AS orders_30d,
                   coalesce(o.gmv_30d, 0) AS gmv_30d_paise,
                   o.last_order_at
            FROM restaurants r
            LEFT JOIN LATERAL (
              SELECT count(*) AS orders_30d, sum(total_paise) AS gmv_30d,
                     max(created_at) AS last_order_at
              FROM orders
              WHERE restaurant_id = r.id AND status <> 'cancelled'
                AND created_at > now() - interval '30 days'
            ) o ON true
            WHERE :q = '' OR r.name ILIKE :pat OR r.slug ILIKE :pat
            ORDER BY r.created_at DESC
            LIMIT 500
            """),
                {"q": search, "pat": f"%{search}%"},
            )
        )
        .mappings()
        .all()
    )
    return [PlatformRestaurant(**row) for row in rows]


async def set_active(db: AsyncSession, restaurant_id: UUID, active: bool) -> Restaurant:
    restaurant = await db.get(Restaurant, restaurant_id, with_for_update=True)
    if restaurant is None:
        raise NotFound("Restaurant not found")
    restaurant.is_active = active
    await db.flush()
    return restaurant
