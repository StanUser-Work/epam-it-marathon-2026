import json

path = "deployment_resources.json"
with open(path, "r", encoding="utf-8-sig") as f:
    data = json.load(f)

api_key = None
for k, v in data.items():
    if isinstance(v, dict) and v.get("resource_type") == "api_gateway":
        api_key = k
        break

if not api_key:
    print("Помилка: api_gateway не знайдено!")
    exit(1)

print(f"Знайдено API Gateway ресурс: {api_key}")
resources = data[api_key].setdefault("resources", {})

method_template = {
    "authorization_type": "cognito_authorizer",
    "integration_type": "lambda",
    "lambda_name": "api-handler",
    "api_key_required": False,
    "method_request_parameters": {},
    "integration_request_body_template": {},
    "responses": [],
    "integration_responses": [],
    "default_error_pattern": True,
    "enable_proxy": True
}

p1 = "/reservations/{reservationId}/guest-session-id"
if p1 not in resources:
    resources[p1] = {
        "enable_cors": {"state": True},
        "GET": method_template
    }
    print(f"Додано: {p1}")
else:
    print(f"{p1} вже існує")

p2 = "/group-reservations/{groupReservationId}/submit"
if p2 not in resources:
    resources[p2] = {
        "enable_cors": {"state": True},
        "POST": method_template
    }
    print(f"Додано: {p2}")
else:
    print(f"{p2} вже існує")

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Файл deployment_resources.json успішно оновлено!")
