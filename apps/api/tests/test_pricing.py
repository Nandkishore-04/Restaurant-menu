from app.services.pricing import compute_totals


def test_tax_added_on_top() -> None:
    t = compute_totals([(25000, 2), (32000, 1)], tax_rate_bps=500, prices_include_tax=False)
    assert (t.subtotal_paise, t.tax_paise, t.total_paise) == (82000, 4100, 86100)


def test_tax_inclusive_prices() -> None:
    t = compute_totals([(10500, 1)], tax_rate_bps=500, prices_include_tax=True)
    assert (t.subtotal_paise, t.tax_paise, t.total_paise) == (10000, 500, 10500)


def test_rounding_half_up() -> None:
    t = compute_totals([(10, 1)], tax_rate_bps=500, prices_include_tax=False)  # 0.5 paise
    assert t.tax_paise == 1


def test_empty() -> None:
    t = compute_totals([], tax_rate_bps=500, prices_include_tax=False)
    assert t.total_paise == 0
