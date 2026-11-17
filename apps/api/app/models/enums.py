from enum import StrEnum


class MemberRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    STAFF = "staff"
    KITCHEN = "kitchen"


class Dietary(StrEnum):
    VEG = "veg"
    NON_VEG = "non_veg"
    EGG = "egg"
    VEGAN = "vegan"


class SessionStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class OrderStatus(StrEnum):
    PLACED = "placed"
    ACCEPTED = "accepted"
    PREPARING = "preparing"
    READY = "ready"
    SERVED = "served"
    CANCELLED = "cancelled"


class PaymentMethod(StrEnum):
    UPI = "upi"
    CASH = "cash"


class PaymentStatus(StrEnum):
    PENDING = "pending"  # guest says they paid / asked to pay cash; staff must confirm
    PAID = "paid"
    REJECTED = "rejected"  # staff didn't receive it
    CANCELLED = "cancelled"  # guest switched method


# Allowed kitchen workflow transitions.
ORDER_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PLACED: {OrderStatus.ACCEPTED, OrderStatus.CANCELLED},
    OrderStatus.ACCEPTED: {OrderStatus.PREPARING, OrderStatus.CANCELLED},
    OrderStatus.PREPARING: {OrderStatus.READY, OrderStatus.CANCELLED},
    OrderStatus.READY: {OrderStatus.SERVED},
    OrderStatus.SERVED: set(),
    OrderStatus.CANCELLED: set(),
}
