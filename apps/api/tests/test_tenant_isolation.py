import uuid

from sqlalchemy import select

from app.db.session import tenant_session
from app.models import MenuItem
from tests.conftest import auth, staff_token


async def test_staff_cannot_access_other_restaurant(client, make_restaurant) -> None:
    a = await make_restaurant()
    b = await make_restaurant()
    for path in ("orders", "menu", "tables"):
        r = await client.get(f"/v1/restaurants/{a['id']}/{path}", headers=auth(b["owner"]))
        assert r.status_code == 403, path
    stranger = staff_token(uuid.uuid4())
    r = await client.get(f"/v1/restaurants/{a['id']}/orders", headers=auth(stranger))
    assert r.status_code == 403


async def test_guest_cannot_order_other_restaurants_item(client, make_restaurant) -> None:
    a = await make_restaurant()
    b = await make_restaurant()
    g = (
        await client.post(f"/v1/public/tables/{a['qr_token']}/sessions", json={"guest_name": "X"})
    ).json()
    r = await client.post(
        "/v1/public/session/cart/items",
        json={"menu_item_id": b["items"]["Paneer Tikka"]},
        headers=auth(g["guest_token"]),
    )
    assert r.status_code == 404


async def test_rls_enforced_at_database_level(make_restaurant) -> None:
    """Even a query with NO restaurant filter only sees the current tenant's rows."""
    a = await make_restaurant()
    b = await make_restaurant()
    async with tenant_session(uuid.UUID(a["id"])) as db:
        ids = {str(i) for i in (await db.scalars(select(MenuItem.id))).all()}
    assert ids == set(a["items"].values())
    assert not ids & set(b["items"].values())

    # Writing a row for another tenant is rejected by the policy's WITH CHECK.
    import pytest
    from sqlalchemy.exc import DBAPIError

    with pytest.raises(DBAPIError):
        async with tenant_session(uuid.UUID(a["id"])) as db:
            db.add(
                MenuItem(
                    restaurant_id=uuid.UUID(b["id"]),
                    category_id=uuid.uuid4(),
                    name="Sneaky",
                    price_paise=1,
                    dietary="veg",
                )
            )
            await db.flush()
