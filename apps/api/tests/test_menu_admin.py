import uuid

from app.db.session import system_session
from app.models import MemberRole, RestaurantMember
from tests.conftest import auth, staff_token


async def test_category_lifecycle(client, make_restaurant) -> None:
    rest = await make_restaurant()
    base, h = f"/v1/restaurants/{rest['id']}/menu", auth(rest["owner"])

    drinks = (await client.post(f"{base}/categories", json={"name": "Drinks"}, headers=h)).json()
    menu = (await client.get(base, headers=h)).json()
    assert [c["name"] for c in menu] == ["Mains", "Drinks"]  # new categories go last

    r = await client.patch(
        f"{base}/categories/{drinks['id']}",
        json={"name": " Beverages ", "is_active": False},
        headers=h,
    )
    assert r.json()["name"] == "Beverages" and r.json()["is_active"] is False

    # Hidden categories disappear from the customer menu.
    public = (await client.get(f"/v1/public/tables/{rest['qr_token']}/menu")).json()
    assert [c["name"] for c in public["categories"]] == ["Mains"]

    # Non-empty categories can't be deleted; empty ones can.
    mains_id = menu[0]["id"]
    assert (await client.delete(f"{base}/categories/{mains_id}", headers=h)).status_code == 409
    assert (await client.delete(f"{base}/categories/{drinks['id']}", headers=h)).status_code == 204


async def test_reorder(client, make_restaurant) -> None:
    rest = await make_restaurant()
    base, h = f"/v1/restaurants/{rest['id']}/menu", auth(rest["owner"])
    await client.post(f"{base}/categories", json={"name": "Breads"}, headers=h)
    menu = (await client.get(base, headers=h)).json()
    ids = [c["id"] for c in menu]

    r = await client.put(f"{base}/categories/order", json={"ids": ids[::-1]}, headers=h)
    assert [c["name"] for c in r.json()] == ["Breads", "Mains"]

    mains = next(c for c in r.json() if c["name"] == "Mains")
    item_ids = [i["id"] for i in mains["items"]][::-1]
    r = await client.put(
        f"{base}/categories/{mains['id']}/items/order", json={"ids": item_ids}, headers=h
    )
    mains = next(c for c in r.json() if c["name"] == "Mains")
    assert [i["id"] for i in mains["items"]] == item_ids

    # Partial lists are rejected so nothing gets an ambiguous position.
    r = await client.put(f"{base}/categories/order", json={"ids": ids[:1]}, headers=h)
    assert r.status_code == 400


async def test_item_edit_sold_out_and_delete(client, make_restaurant) -> None:
    rest = await make_restaurant()
    base, h = f"/v1/restaurants/{rest['id']}/menu", auth(rest["owner"])
    paneer = rest["items"]["Paneer Tikka"]

    r = await client.patch(
        f"{base}/items/{paneer}",
        json={"price_paise": 27500, "description": "Smoky", "name": None},
        headers=h,
    )
    assert r.status_code == 200
    assert (r.json()["price_paise"], r.json()["name"]) == (27500, "Paneer Tikka")

    await client.patch(f"{base}/items/{paneer}", json={"is_available": False}, headers=h)
    public = (await client.get(f"/v1/public/tables/{rest['qr_token']}/menu")).json()
    item = next(i for i in public["categories"][0]["items"] if i["id"] == paneer)
    assert item["is_available"] is False

    # Order a dish, then delete it: the past order keeps its snapshot.
    chicken = rest["items"]["Butter Chicken"]
    g = (
        await client.post(
            f"/v1/public/tables/{rest['qr_token']}/sessions", json={"guest_name": "A"}
        )
    ).json()
    gh = auth(g["guest_token"])
    await client.post("/v1/public/session/cart/items", json={"menu_item_id": chicken}, headers=gh)
    assert (await client.post("/v1/public/session/orders", headers=gh)).status_code == 201

    assert (await client.delete(f"{base}/items/{chicken}", headers=h)).status_code == 204
    assert (await client.delete(f"{base}/items/{chicken}", headers=h)).status_code == 404
    orders = (await client.get("/v1/public/session/orders", headers=gh)).json()
    assert orders[0]["items"][0]["name"] == "Butter Chicken"
    assert orders[0]["items"][0]["menu_item_id"] is None


async def test_kitchen_staff_cannot_edit_menu(client, make_restaurant) -> None:
    rest = await make_restaurant()
    cook_id = uuid.uuid4()
    async with system_session() as db:
        db.add(
            RestaurantMember(
                restaurant_id=uuid.UUID(rest["id"]), user_id=cook_id, role=MemberRole.KITCHEN
            )
        )
    cook = auth(staff_token(cook_id))
    rid = rest["id"]
    assert (await client.get(f"/v1/restaurants/{rid}/orders", headers=cook)).status_code == 200
    assert (await client.get(f"/v1/restaurants/{rid}/menu", headers=cook)).status_code == 403
    r = await client.post(
        f"/v1/restaurants/{rid}/menu/categories", json={"name": "Nope"}, headers=cook
    )
    assert r.status_code == 403
