"""
Seeds the deployed environment with demo data through the public API:
one location with tables and dishes, a demo Customer (reservation owner) and a demo Waiter.

The script is idempotent: existing location / users / waiter binding are reused.

Usage:
    export API_BASE_URL=https://<api-id>.execute-api.eu-central-1.amazonaws.com/develop
    export OWNER_EMAIL=owner.demo@example.com   OWNER_PASSWORD='...'
    export WAITER_EMAIL=waiter.demo@example.com WAITER_PASSWORD='...'
    python infra/seed/seed_demo_data.py

Passwords: 8-16 chars, upper + lower case, a digit and a symbol (Cognito policy).
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("API_BASE_URL", "").rstrip("/")
LOCATION_ADDRESS = os.environ.get("SEED_LOCATION_ADDRESS", "48 Rustaveli Avenue")

TABLES = [(1, 2), (2, 4), (3, 4), (4, 6), (5, 8)]

DISHES = [
    ("Caesar Salad", "Romaine, parmesan, croutons and classic dressing", "Appetizer", 18, "250 g"),
    ("Fresh Strawberry Mint Salad", "Strawberries, mint, spinach and balsamic", "Appetizer", 14, "220 g"),
    ("Avocado Toast", "Sourdough, smashed avocado and chili flakes", "Appetizer", 10, "180 g"),
    ("Tom Yum", "Spicy Thai soup with shrimps and mushrooms", "MainCourse", 22, "350 g"),
    ("Grilled Salmon", "Salmon fillet with seasonal vegetables", "MainCourse", 40, "320 g"),
    ("Mushroom Risotto", "Arborio rice, porcini and parmesan", "MainCourse", 16.5, "300 g"),
    ("Cheesecake", "New York style cheesecake with berries", "Dessert", 9, "150 g"),
    ("Chocolate Fondant", "Warm chocolate cake with vanilla ice cream", "Dessert", 11, "160 g"),
]


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode() or "null"
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode() or "null"
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def as_list(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "data", "locations", "dishes", "content"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def ensure_location():
    _, payload = call("GET", "/locations")
    for loc in as_list(payload):
        if loc.get("address") == LOCATION_ADDRESS:
            print(f"location exists: {loc['id']}")
            return loc["id"], False
    status, payload = call("POST", "/locations", {
        "address": LOCATION_ADDRESS,
        "description": "Green & Tasty demo location",
        "totalCapacity": sum(c for _, c in TABLES),
        "averageOccupancy": "60%",
        "rating": 4.8,
    })
    assert status in (200, 201), (status, payload)
    _, payload = call("GET", "/locations")
    loc_id = next(l["id"] for l in as_list(payload) if l.get("address") == LOCATION_ADDRESS)
    print(f"location created: {loc_id}")
    return loc_id, True


def ensure_tables(location_id):
    for number, capacity in TABLES:
        status, payload = call("POST", "/tables", {"locationId": location_id, "tableNumber": number, "capacity": capacity})
        print(f"table {number} ({capacity} seats): {status}")


def ensure_dishes(location_id):
    for name, description, dish_type, price, weight in DISHES:
        status, payload = call("POST", "/dishes", {
            "name": name, "description": description, "dishType": dish_type, "price": price, "weight": weight,
            "calories": "350 kcal", "proteins": "12 g", "fats": "10 g", "carbohydrates": "40 g", "vitamins": "A, C",
            "state": "Available", "locationIds": [location_id],
        })
        print(f"dish {name}: {status}")


def ensure_user(email, password, first, last):
    status, payload = call("POST", "/register", {
        "firstName": first, "lastName": last, "email": email, "password": password, "confirmPassword": password,
    })
    if status == 409:
        print(f"user exists: {email}")
    else:
        assert status == 200, (status, payload)
        print(f"user created: {email}")


def main():
    if not API:
        sys.exit("API_BASE_URL is not set")
    owner_email, owner_password = os.environ.get("OWNER_EMAIL"), os.environ.get("OWNER_PASSWORD")
    waiter_email, waiter_password = os.environ.get("WAITER_EMAIL"), os.environ.get("WAITER_PASSWORD")

    location_id, created = ensure_location()
    if created:
        ensure_tables(location_id)
        ensure_dishes(location_id)

    if owner_email and owner_password:
        ensure_user(owner_email, owner_password, "Stanislav", "Owner")
    if waiter_email and waiter_password:
        ensure_user(waiter_email, waiter_password, "Maria", "Waiter")
        status, payload = call("POST", "/waiters", {"email": waiter_email, "locationId": location_id})
        print(f"waiter binding: {status} {payload if status not in (200, 409) else ''}")

    print(f"LOCATION_ID={location_id}")


if __name__ == "__main__":
    main()
