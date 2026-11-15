import httpx

from tests.conftest import auth


async def test_health(client: httpx.AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


async def test_family_shares_one_cart_and_orders(client, make_restaurant, publisher) -> None:
    rest = await make_restaurant()
    qr = rest["qr_token"]

    menu = (await client.get(f"/v1/public/tables/{qr}/menu")).json()
    assert menu["table_label"] == "T1"
    assert [i["name"] for i in menu["categories"][0]["items"]] == [
        "Paneer Tikka",
        "Butter Chicken",
    ]  # owner-defined order

    # Two family members scan the same table QR -> same session.
    mom = (await client.post(f"/v1/public/tables/{qr}/sessions", json={"guest_name": "Mom"})).json()
    kid = (await client.post(f"/v1/public/tables/{qr}/sessions", json={"guest_name": "Kid"})).json()
    assert mom["session_id"] == kid["session_id"]
    assert mom["realtime_channel"] == f"session:{mom['session_id']}"

    paneer, chicken = rest["items"]["Paneer Tikka"], rest["items"]["Butter Chicken"]
    r = await client.post(
        "/v1/public/session/cart/items",
        json={"menu_item_id": paneer, "quantity": 2},
        headers=auth(mom["guest_token"]),
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        "/v1/public/session/cart/items",
        json={"menu_item_id": chicken, "note": "less spicy"},
        headers=auth(kid["guest_token"]),
    )
    cart = r.json()
    # Kid sees Mom's items too: one shared cart.
    assert {(i["name"], i["guest_name"], i["quantity"]) for i in cart["items"]} == {
        ("Paneer Tikka", "Mom", 2),
        ("Butter Chicken", "Kid", 1),
    }
    assert cart["totals"] == {"subtotal_paise": 82000, "tax_paise": 4100, "total_paise": 86100}
    assert "cart_updated" in {e for _, e, _ in publisher.sent}

    # Kid bumps Mom's line (shared editing), then places the order.
    mom_line = next(i for i in cart["items"] if i["guest_name"] == "Mom")
    r = await client.patch(
        f"/v1/public/session/cart/items/{mom_line['id']}",
        json={"quantity": 3},
        headers=auth(kid["guest_token"]),
    )
    assert r.status_code == 200
    r = await client.post("/v1/public/session/orders", headers=auth(kid["guest_token"]))
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["order_number"] == 1
    assert order["status"] == "placed"
    assert order["total_paise"] == (75000 + 32000) * 105 // 100
    assert order["table_label"] == "T1"
    assert {i["note"] for i in order["items"]} == {None, "less spicy"}

    # Cart is emptied; ordering again with an empty cart is rejected.
    assert (await client.get("/v1/public/session/cart", headers=auth(mom["guest_token"]))).json()[
        "items"
    ] == []
    r = await client.post("/v1/public/session/orders", headers=auth(mom["guest_token"]))
    assert r.status_code == 400

    # Kitchen sees the order and moves it along.
    rid = rest["id"]
    r = await client.get(
        f"/v1/restaurants/{rid}/orders", params={"status": "placed"}, headers=auth(rest["owner"])
    )
    assert [o["id"] for o in r.json()] == [order["id"]]
    assert ("restaurant:" + rid, "order_created") in {(t, e) for t, e, _ in publisher.sent}

    r = await client.patch(
        f"/v1/restaurants/{rid}/orders/{order['id']}",
        json={"status": "served"},
        headers=auth(rest["owner"]),
    )
    assert r.status_code == 409  # can't skip straight from placed to served
    r = await client.patch(
        f"/v1/restaurants/{rid}/orders/{order['id']}",
        json={"status": "accepted"},
        headers=auth(rest["owner"]),
    )
    assert r.status_code == 200 and r.json()["status"] == "accepted"

    # Guests see the updated status.
    mine = (await client.get("/v1/public/session/orders", headers=auth(mom["guest_token"]))).json()
    assert mine[0]["status"] == "accepted"


async def test_closed_session_rejects_old_guest_tokens(client, make_restaurant) -> None:
    rest = await make_restaurant()
    g = (
        await client.post(
            f"/v1/public/tables/{rest['qr_token']}/sessions", json={"guest_name": "A"}
        )
    ).json()
    r = await client.post(
        f"/v1/restaurants/{rest['id']}/table-sessions/{g['session_id']}/close",
        headers=auth(rest["owner"]),
    )
    assert r.status_code == 204
    r = await client.get("/v1/public/session/cart", headers=auth(g["guest_token"]))
    assert r.status_code == 410

    # Next party scanning the same table gets a fresh session.
    g2 = (
        await client.post(
            f"/v1/public/tables/{rest['qr_token']}/sessions", json={"guest_name": "B"}
        )
    ).json()
    assert g2["session_id"] != g["session_id"]


async def test_unavailable_item_cannot_be_added(client, make_restaurant) -> None:
    rest = await make_restaurant()
    paneer = rest["items"]["Paneer Tikka"]
    r = await client.patch(
        f"/v1/restaurants/{rest['id']}/menu/items/{paneer}",
        json={"is_available": False},
        headers=auth(rest["owner"]),
    )
    assert r.status_code == 200
    g = (
        await client.post(
            f"/v1/public/tables/{rest['qr_token']}/sessions", json={"guest_name": "A"}
        )
    ).json()
    r = await client.post(
        "/v1/public/session/cart/items",
        json={"menu_item_id": paneer},
        headers=auth(g["guest_token"]),
    )
    assert r.status_code == 409


async def test_auth_required(client, make_restaurant) -> None:
    rest = await make_restaurant()
    assert (await client.get("/v1/public/session/cart")).status_code == 401
    r = await client.get("/v1/public/session/cart", headers=auth("not-a-token"))
    assert r.status_code == 401
    # A staff token is not a guest token.
    r = await client.get("/v1/public/session/cart", headers=auth(rest["owner"]))
    assert r.status_code == 401
    assert (await client.get("/v1/public/tables/nope/menu")).status_code == 404
