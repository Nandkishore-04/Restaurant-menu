"""Overview numbers for one restaurant, computed in the restaurant's own timezone."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.admin import DayPoint, OverviewStats, TopDish

# All queries run in a tenant_session, so RLS limits every table to this restaurant.
_TODAY = "(now() AT TIME ZONE :tz)::date"


async def overview(db: AsyncSession, tz: str, days: int = 7) -> OverviewStats:
    p = {"tz": tz, "days": days}
    day_totals = (
        await db.execute(
            text(f"""
            SELECT
              coalesce(sum(total_paise) FILTER (WHERE d = {_TODAY}), 0)     AS rev_today,
              count(*)                  FILTER (WHERE d = {_TODAY})         AS n_today,
              coalesce(sum(total_paise) FILTER (WHERE d = {_TODAY} - 1), 0) AS rev_yday,
              count(*)                  FILTER (WHERE d = {_TODAY} - 1)     AS n_yday
            FROM (
              SELECT total_paise, (created_at AT TIME ZONE :tz)::date AS d
              FROM orders WHERE status <> 'cancelled'
                AND created_at > now() - interval '3 days'
            ) o
            """),
            p,
        )
    ).one()

    series_rows = (
        await db.execute(
            text(f"""
            SELECT g::date AS day,
                   coalesce(sum(o.total_paise), 0) AS revenue,
                   count(o.id) AS orders
            FROM generate_series({_TODAY} - (:days - 1), {_TODAY}, interval '1 day') g
            LEFT JOIN orders o
              ON (o.created_at AT TIME ZONE :tz)::date = g::date AND o.status <> 'cancelled'
            GROUP BY g ORDER BY g
            """),
            p,
        )
    ).all()

    top_rows = (
        await db.execute(
            text(f"""
            SELECT oi.name, sum(oi.quantity) AS qty, sum(oi.line_total_paise) AS revenue
            FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE o.status <> 'cancelled'
              AND (o.created_at AT TIME ZONE :tz)::date > {_TODAY} - CAST(:days AS int)
            GROUP BY oi.name ORDER BY qty DESC, revenue DESC LIMIT 5
            """),
            p,
        )
    ).all()

    live = (
        await db.execute(
            text("""
            SELECT status, count(*) FROM orders
            WHERE status IN ('placed', 'accepted', 'preparing', 'ready')
            GROUP BY status
            """)
        )
    ).all()

    misc = (
        await db.execute(
            text(f"""
            SELECT
              (SELECT coalesce(sum(amount_paise), 0) FROM payments
                WHERE status = 'paid' AND (confirmed_at AT TIME ZONE :tz)::date = {_TODAY}),
              (SELECT count(*) FROM payments WHERE status = 'pending'),
              (SELECT count(*) FROM table_sessions WHERE status = 'open'),
              (SELECT count(*) FROM dining_tables WHERE is_active)
            """),
            p,
        )
    ).one()

    return OverviewStats(
        today_revenue_paise=day_totals.rev_today,
        today_orders=day_totals.n_today,
        yesterday_revenue_paise=day_totals.rev_yday,
        yesterday_orders=day_totals.n_yday,
        avg_order_paise=(day_totals.rev_today // day_totals.n_today) if day_totals.n_today else 0,
        collected_today_paise=misc[0],
        pending_payments=misc[1],
        open_tables=misc[2],
        total_tables=misc[3],
        live_orders={s: n for s, n in live},
        series=[DayPoint(day=r.day, revenue_paise=r.revenue, orders=r.orders) for r in series_rows],
        top_dishes=[
            TopDish(name=r.name, quantity=r.qty, revenue_paise=r.revenue) for r in top_rows
        ],
    )
