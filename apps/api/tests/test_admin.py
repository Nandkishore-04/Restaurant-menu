import uuid
from datetime import date, timedelta

from app.db.session import system_session
from app.models import PlatformAdmin
from tests.conftest import auth, staff_token


async def _place_order(client, rest, items):
    qr = rest["qr_token"]
    g = (await client.post(f"/v1/public/tables/{qr}/sessions", json={"guest_name": "G"})).json()
    h = auth(g["guest_token"])
    for item_id, qty in items:
        r = await client.post(
            "/v1/public/session/cart/items",
            json={"menu_item_id": item_id, "quantity": qty},
            headers=h,
        )
        assert r.status_code == 200, r.text
    r = await client.post("/v1/public/session/orders", headers=h)
    assert r.status_code == 201, r.text
    return g, h, r.json()


async def test_overview_numbers(client, make_restaurant) -> None:
    rest = await make_restaurant()
    paneer, chicken = rest["items"]["Paneer Tikka"], rest["items"]["Butter Chicken"]
    _, h, o1 = await _place_order(client, rest, [(paneer, 2), (chicken, 1)])
    await client.post("/v1/public/session/payments", json={"method": "cash"}, headers=h)

    r = await client.get(f"/v1/restaurants/{rest['id']}/overview", headers=auth(rest["owner"]))
    assert r.status_code == 200, r.text
    s = r.json()
    assert (s["today_orders"], s["today_revenue_paise"]) == (1, o1["total_paise"])
    assert s["avg_order_paise"] == o1["total_paise"]
    assert s["pending_payments"] == 1 and s["open_tables"] == 1 and s["total_tables"] == 1
    assert s["live_orders"] == {"placed": 1}
    assert len(s["series"]) == 7 and s["series"][-1]["revenue_paise"] == o1["total_paise"]
    assert s["top_dishes"][0] == {"name": "Paneer Tikka", "quantity": 2, "revenue_paise": 50000}


async def test_live_tables_rotate_qr_and_order_history(client, make_restaurant) -> None:
    rest = await make_restaurant()
    base, h = f"/v1/restaurants/{rest['id']}", auth(rest["owner"])
    free = (await client.post(f"{base}/tables", json={"label": "T2"}, headers=h)).json()
    _, gh, order = await _place_order(client, rest, [(rest["items"]["Paneer Tikka"], 1)])
    await client.post(
        "/v1/public/session/cart/items",
        json={"menu_item_id": rest["items"]["Butter Chicken"]},
        headers=gh,
    )

    live = {t["label"]: t for t in (await client.get(f"{base}/tables/live", headers=h)).json()}
    assert live["T2"]["session"] is None
    s = live["T1"]["session"]
    assert (s["order_count"], s["due_paise"], s["cart_items"]) == (1, order["total_paise"], 1)
    assert s["payment_pending"] is False

    # Rename + rotate QR: the old printed code stops working.
    r = await client.patch(
        f"{base}/tables/{free['id']}", json={"label": "Patio 1", "seats": 6}, headers=h
    )
    assert (r.json()["label"], r.json()["seats"]) == ("Patio 1", 6)
    r = await client.patch(f"{base}/tables/{free['id']}", json={"label": "T1"}, headers=h)
    assert r.status_code == 409
    old = free["qr_token"]
    new = (await client.post(f"{base}/tables/{free['id']}/rotate-qr", headers=h)).json()["qr_token"]
    assert new != old
    assert (await client.get(f"/v1/public/tables/{old}/menu")).status_code == 404
    assert (await client.get(f"/v1/public/tables/{new}/menu")).status_code == 200

    # Order history by restaurant-local day.
    today = date.today()
    for d, expected in ((today, [order["id"]]), (today - timedelta(days=2), [])):
        r = await client.get(f"{base}/orders", params={"day": d.isoformat()}, headers=h)
        assert [o["id"] for o in r.json()] == expected


async def test_staff_invites_and_roles(client, make_restaurant) -> None:
    rest = await make_restaurant()
    rid, owner = rest["id"], auth(rest["owner"])

    r = await client.post(
        f"/v1/restaurants/{rid}/invites", json={"role": "manager", "email": "m@x.in"}, headers=owner
    )
    assert r.status_code == 201, r.text
    invite = r.json()
    token = invite["link"].rsplit("/", 1)[1]
    assert invite["link"].startswith("http://localhost:3001/invite/")

    preview = (await client.get(f"/v1/invites/{token}")).json()
    assert preview["valid"] and preview["role"] == "manager" and preview["restaurant_name"]

    mgr_id = uuid.uuid4()
    mgr = auth(staff_token(mgr_id, "m@x.in"))
    r = await client.post(f"/v1/invites/{token}/accept", headers=mgr)
    assert r.json() == {"restaurant_id": rid, "role": "manager"}
    assert (await client.post(f"/v1/invites/{token}/accept", headers=mgr)).status_code == 410
    assert not (await client.get(f"/v1/invites/{token}")).json()["valid"]

    members = (await client.get(f"/v1/restaurants/{rid}/members", headers=mgr)).json()
    me = next(m for m in members if m["is_you"])
    assert (me["email"], me["role"]) == ("m@x.in", "manager")
    owner_member = next(m for m in members if m["role"] == "owner")

    # Managers can see staff but only owners manage them.
    r = await client.post(f"/v1/restaurants/{rid}/invites", json={"role": "staff"}, headers=mgr)
    assert r.status_code == 403
    # Last owner can't be demoted or removed.
    r = await client.patch(
        f"/v1/restaurants/{rid}/members/{owner_member['id']}", json={"role": "staff"}, headers=owner
    )
    assert r.status_code == 409
    assert (
        await client.delete(f"/v1/restaurants/{rid}/members/{owner_member['id']}", headers=owner)
    ).status_code == 409
    r = await client.patch(
        f"/v1/restaurants/{rid}/members/{me['id']}", json={"role": "kitchen"}, headers=owner
    )
    assert r.json()["role"] == "kitchen"
    # Now a kitchen user: no access to staff list.
    assert (await client.get(f"/v1/restaurants/{rid}/members", headers=mgr)).status_code == 403
    r = await client.delete(f"/v1/restaurants/{rid}/members/{me['id']}", headers=owner)
    assert r.status_code == 204
    assert (await client.get(f"/v1/restaurants/{rid}/orders", headers=mgr)).status_code == 403

    # Revoked invites can't be used.
    inv2 = (
        await client.post(f"/v1/restaurants/{rid}/invites", json={"role": "staff"}, headers=owner)
    ).json()
    assert len((await client.get(f"/v1/restaurants/{rid}/invites", headers=owner)).json()) == 1
    await client.delete(f"/v1/restaurants/{rid}/invites/{inv2['id']}", headers=owner)
    tok2 = inv2["link"].rsplit("/", 1)[1]
    r = await client.post(f"/v1/invites/{tok2}/accept", headers=auth(staff_token(uuid.uuid4())))
    assert r.status_code == 410


async def test_platform_admin(client, make_restaurant) -> None:
    rest = await make_restaurant()
    await _place_order(client, rest, [(rest["items"]["Paneer Tikka"], 1)])
    nobody = auth(rest["owner"])
    assert (await client.get("/v1/platform/me", headers=nobody)).json() == {
        "is_platform_admin": False
    }
    assert (await client.get("/v1/platform/stats", headers=nobody)).status_code == 403

    admin_id = uuid.uuid4()
    async with system_session() as db:
        db.add(PlatformAdmin(user_id=admin_id, email="ops@qrmenu.in"))
    admin = auth(staff_token(admin_id))
    assert (await client.get("/v1/platform/me", headers=admin)).json()["is_platform_admin"]

    s = (await client.get("/v1/platform/stats", headers=admin)).json()
    assert s["restaurants"] >= 1 and s["orders_today"] >= 1 and len(s["series"]) == 14

    rows = (
        await client.get("/v1/platform/restaurants", params={"search": "Test"}, headers=admin)
    ).json()
    row = next(r for r in rows if r["id"] == rest["id"])
    assert row["orders_30d"] == 1 and row["tables"] == 1 and row["staff"] == 1
    assert row["is_active"] and row["upi_configured"] is False

    # Suspending turns the restaurant's QR codes off; reactivating restores them.
    r = await client.patch(
        f"/v1/platform/restaurants/{rest['id']}", json={"is_active": False}, headers=admin
    )
    assert r.json()["is_active"] is False
    assert (await client.get(f"/v1/public/tables/{rest['qr_token']}/menu")).status_code == 404
    await client.patch(
        f"/v1/platform/restaurants/{rest['id']}", json={"is_active": True}, headers=admin
    )
    assert (await client.get(f"/v1/public/tables/{rest['qr_token']}/menu")).status_code == 200
