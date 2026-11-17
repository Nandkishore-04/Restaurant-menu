import uuid
from urllib.parse import parse_qs, urlparse

from app.db.session import system_session
from app.models import MemberRole, RestaurantMember
from tests.conftest import auth, staff_token


async def _table_with_orders(client, rest):
    """Two guests, two rounds of ordering (one later cancelled by the kitchen)."""
    qr = rest["qr_token"]
    a = (await client.post(f"/v1/public/tables/{qr}/sessions", json={"guest_name": "A"})).json()
    ha = auth(a["guest_token"])
    paneer, chicken = rest["items"]["Paneer Tikka"], rest["items"]["Butter Chicken"]

    async def order(items):
        for item_id, qty in items:
            r = await client.post(
                "/v1/public/session/cart/items",
                json={"menu_item_id": item_id, "quantity": qty},
                headers=ha,
            )
            assert r.status_code == 200, r.text
        r = await client.post("/v1/public/session/orders", headers=ha)
        assert r.status_code == 201, r.text
        return r.json()

    await order([(paneer, 1), (chicken, 1)])
    await order([(paneer, 2)])
    cancelled = await order([(chicken, 5)])
    r = await client.patch(
        f"/v1/restaurants/{rest['id']}/orders/{cancelled['id']}",
        json={"status": "cancelled"},
        headers=auth(rest["owner"]),
    )
    assert r.status_code == 200
    return ha


async def test_bill_merges_rounds_and_skips_cancelled(client, make_restaurant) -> None:
    rest = await make_restaurant()
    ha = await _table_with_orders(client, rest)
    bill = (await client.get("/v1/public/session/bill", headers=ha)).json()

    assert {(line["name"], line["quantity"]) for line in bill["lines"]} == {
        ("Paneer Tikka", 3),
        ("Butter Chicken", 1),
    }
    subtotal = 3 * 25000 + 32000
    assert bill["subtotal_paise"] == subtotal
    assert bill["total_paise"] == bill["due_paise"] == subtotal + bill["tax_paise"]
    assert bill["order_count"] == 2
    assert bill["paid_paise"] == 0 and bill["pending_payment"] is None

    # No UPI ID configured -> demo QR that can't move real money.
    upi = bill["upi"]
    assert upi["is_demo"] is True and upi["vpa"].endswith("@example")
    q = parse_qs(urlparse(upi["uri"]).query)
    assert upi["uri"].startswith("upi://pay?")
    assert q["am"] == [f"{bill['due_paise'] / 100:.2f}"] and q["cu"] == ["INR"]


async def test_upi_payment_needs_staff_confirmation(client, make_restaurant, publisher) -> None:
    rest = await make_restaurant()
    ha = await _table_with_orders(client, rest)
    due = (await client.get("/v1/public/session/bill", headers=ha)).json()["due_paise"]

    r = await client.post(
        "/v1/public/session/payments",
        json={"method": "upi", "reference": "412345678901"},
        headers=ha,
    )
    assert r.status_code == 201, r.text
    payment = r.json()
    assert (payment["status"], payment["amount_paise"]) == ("pending", due)

    # A guest's claim alone doesn't mark the bill paid.
    bill = (await client.get("/v1/public/session/bill", headers=ha)).json()
    assert bill["due_paise"] == due and bill["pending_payment"]["id"] == payment["id"]
    assert ("restaurant:" + rest["id"], "payment_requested") in {
        (t, e) for t, e, _ in publisher.sent
    }

    staff = auth(rest["owner"])
    pending = (
        await client.get(
            f"/v1/restaurants/{rest['id']}/payments", params={"status": "pending"}, headers=staff
        )
    ).json()
    assert [p["id"] for p in pending] == [payment["id"]]
    assert pending[0]["table_label"] == "T1" and pending[0]["reference"] == "412345678901"

    r = await client.post(
        f"/v1/restaurants/{rest['id']}/payments/{payment['id']}/decision",
        json={"status": "paid"},
        headers=staff,
    )
    assert r.json()["status"] == "paid" and r.json()["confirmed_at"]
    bill = (await client.get("/v1/public/session/bill", headers=ha)).json()
    assert (bill["paid_paise"], bill["due_paise"]) == (due, 0)
    assert bill["pending_payment"] is None

    # Nothing left to pay; deciding twice is refused.
    r = await client.post("/v1/public/session/payments", json={"method": "cash"}, headers=ha)
    assert r.status_code == 400
    r = await client.post(
        f"/v1/restaurants/{rest['id']}/payments/{payment['id']}/decision",
        json={"status": "rejected"},
        headers=staff,
    )
    assert r.status_code == 409


async def test_switching_method_and_rejection(client, make_restaurant) -> None:
    rest = await make_restaurant()
    ha = await _table_with_orders(client, rest)
    upi = (
        await client.post("/v1/public/session/payments", json={"method": "upi"}, headers=ha)
    ).json()
    again = (
        await client.post("/v1/public/session/payments", json={"method": "upi"}, headers=ha)
    ).json()
    assert again["id"] == upi["id"]  # same method: no duplicate

    cash = (
        await client.post("/v1/public/session/payments", json={"method": "cash"}, headers=ha)
    ).json()
    bill = (await client.get("/v1/public/session/bill", headers=ha)).json()
    statuses = {p["id"]: p["status"] for p in bill["payments"]}
    assert statuses == {upi["id"]: "cancelled", cash["id"]: "pending"}

    r = await client.post(
        f"/v1/restaurants/{rest['id']}/payments/{cash['id']}/decision",
        json={"status": "rejected"},
        headers=auth(rest["owner"]),
    )
    assert r.json()["status"] == "rejected"
    bill = (await client.get("/v1/public/session/bill", headers=ha)).json()
    assert bill["due_paise"] == bill["total_paise"] and bill["pending_payment"] is None


async def test_payment_validation_and_permissions(client, make_restaurant) -> None:
    rest = await make_restaurant()
    qr = rest["qr_token"]
    g = (await client.post(f"/v1/public/tables/{qr}/sessions", json={"guest_name": "A"})).json()
    hg = auth(g["guest_token"])
    # Nothing ordered yet.
    r = await client.post("/v1/public/session/payments", json={"method": "upi"}, headers=hg)
    assert r.status_code == 400
    r = await client.post(
        "/v1/public/session/payments", json={"method": "upi", "reference": "x!"}, headers=hg
    )
    assert r.status_code == 422

    cook_id = uuid.uuid4()
    async with system_session() as db:
        db.add(
            RestaurantMember(
                restaurant_id=uuid.UUID(rest["id"]), user_id=cook_id, role=MemberRole.KITCHEN
            )
        )
    r = await client.get(
        f"/v1/restaurants/{rest['id']}/payments", headers=auth(staff_token(cook_id))
    )
    assert r.status_code == 403


async def test_restaurant_upi_settings(client, make_restaurant) -> None:
    rest = await make_restaurant()
    h, base = auth(rest["owner"]), f"/v1/restaurants/{rest['id']}"
    r = await client.patch(base, json={"upi_vpa": "not a vpa"}, headers=h)
    assert r.status_code == 422
    r = await client.patch(
        base, json={"upi_vpa": "spiceroute@okaxis", "upi_payee_name": "Spice Route"}, headers=h
    )
    assert r.status_code == 200 and r.json()["upi_vpa"] == "spiceroute@okaxis"

    ha = await _table_with_orders(client, rest)
    upi = (await client.get("/v1/public/session/bill", headers=ha)).json()["upi"]
    assert upi["is_demo"] is False and upi["vpa"] == "spiceroute@okaxis"
    assert parse_qs(urlparse(upi["uri"]).query)["pn"] == ["Spice Route"]
