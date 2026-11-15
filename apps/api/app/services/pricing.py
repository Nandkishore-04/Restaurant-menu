from app.schemas.ordering import Totals


def _round_div(numerator: int, denominator: int) -> int:
    """Integer division rounding half up (for non-negative values)."""
    return (numerator * 2 + denominator) // (denominator * 2)


def compute_totals(
    lines: list[tuple[int, int]], *, tax_rate_bps: int, prices_include_tax: bool
) -> Totals:
    """lines: (unit_price_paise, quantity). All money is integer paise."""
    subtotal = sum(price * qty for price, qty in lines)
    if prices_include_tax:
        tax = _round_div(subtotal * tax_rate_bps, 10_000 + tax_rate_bps)
        return Totals(subtotal_paise=subtotal - tax, tax_paise=tax, total_paise=subtotal)
    tax = _round_div(subtotal * tax_rate_bps, 10_000)
    return Totals(subtotal_paise=subtotal, tax_paise=tax, total_paise=subtotal + tax)
