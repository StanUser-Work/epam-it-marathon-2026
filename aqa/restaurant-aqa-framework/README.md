# Restaurant E2E & API Test Automation Framework

Наскрізні тести функціоналу **Групового Pre-Order** (Owner flow) застосунку Green & Tasty, рівні 1–3.
Тести виконуються проти **власного розгорнутого застосунку** (Backend + Frontend на AWS), без моків.

## Обраний напрям і підхід

- **Напрям 1 — Груповий pre-order.** Backend і Frontend реалізовані в попередніх ДЗ, інтегровані й розгорнуті:
  - Frontend: CloudFront → `https://d2itb54hfo2xf3.cloudfront.net`
  - API: API Gateway → `https://6p4vdewhse.execute-api.eu-central-1.amazonaws.com/develop`
- **Підхід:** Playwright + TypeScript, **Page Object Model + API-клієнт + фікстури сценарію** (без BDD).
  Шари:
  - `src/api/` — API-клієнт (підготовка даних і API-перевірки), моделі відповідей;
  - `src/pages/` — page objects з локаторами (роль + доступне ім'я, далі текст, CSS — лише там, де немає ролі) і діями;
  - `src/fixtures/` — `GroupScenario` (Owner + бронювання + група + гості через invite-flow), ізольована локація з офіціантом, Playwright-фікстури;
  - `src/tests/level{1,2,3}/*.ui.spec.ts | *.api.spec.ts` — сценарії.
- **Піраміда тестів:**
  - **UI:** Owner бачить учасників, страви, кількості й суми; зміна кошика гостя; порожня група; консолідація й Submit; офіціант бачить замовлення; видалення учасника; наскрізний сценарій.
  - **API:** авторизація й валідація (401 / 403 / 404 / 400, повторний submit, чужий учасник) та підготовка даних (реєстрація, бронювання, гості, кошики, власний pre-order Owner).

## Як влаштовані дані

- Кожен тест реєструє **власного** Owner (унікальний email) і створює **своє** бронювання на випадковий день/годину `now + N днів` — тести незалежні й можуть іти паралельно.
- Гості приєднуються так само, як у UI: `invite-token → /guest/invites/{token} → POST /guest/sessions`.
- **Global setup** створює для запуску тимчасову локацію (5 столів, 3 страви, власний офіціант); **global teardown** її видаляє. Демо-дані середовища тести не чіпають.
- Тести, що перевіряють **екран офіціанта**, створюють окрему ізольовану локацію з власним офіціантом, тож на його дашборді лише одне бронювання.
- Після кожного тесту бронювання скасовується. API видалення користувачів і бронювань немає, тому використовуються унікальні дані (email з префіксом `aqa.` + guid).
- Вхід у UI: токени отримуються через `POST /signin` і записуються в `localStorage` так само, як це робить застосунок (підготовка стану поза UI).
- Тимчасові збої середовища (ліміт одночасних Lambda → `{"message":"Internal server error"}` / 429 / 5xx шлюзу) повторюються в API-клієнті; помилки застосунку (`{"error": ...}`) не повторюються.

## Поведінка, не визначена в ДЗ (обрана й протестована)

| Випадок | Поведінка |
|---|---|
| Група, до якої ніхто не приєднався | `200`, `{ "participants": [], "total": 0 }`; UI — «Participants haven't added any dishes yet» |
| Owner у списку | з'являється як `type: "Owner"`, коли у власному pre-order Owner є страви (його сесія відображає замовлення бронювання) |
| `total` у `GET …/sessions` | сума по всіх учасниках (і непідтверджених); Grand Total в UI — лише підтверджені кошики |
| Не-Owner (інший клієнт, офіціант) | `403` |
| Без токена / токен гостя | `401` |
| Неіснуюча група / бронювання / учасник | `404` |
| Повторний submit | `400 "Group reservation was submitted."` |
| Submit без власного pre-order Owner | `400 "Order not found."`, у UI — toast з цим текстом, кнопку можна натиснути знову |
| Немає підтверджених кошиків | `400 "No submitted sessions found."`; у UI кнопка Submit неактивна |
| Підтверджені кошики без страв | `400`; через публічний API цей стан недосяжний (гість не може підтвердити порожній кошик) — покрито unit-тестом бекенду |
| Учасник іншої групи | `400`, учасника не видалено |
| Видалення сесії Owner | `400` |
| Видалення після submit | `400` |
| Видалення останнього учасника | `200`, `{ "participants": [], "total": 0 }` |
| Повторне відкриття вже відправленої групи | бейдж «Sent to Restaurant», екран read-only |

## Налаштування

Потрібні Node.js 22+.

```bash
cd aqa/restaurant-aqa-framework
npm ci
npx playwright install chromium
cp .env.example .env   # заповнити FRONTEND_URL і API_BASE_URL
```

`.env` у `.gitignore` — не комітимо. Мінімально потрібні лише `FRONTEND_URL` і `API_BASE_URL`; локацію й офіціанта створює global setup.
Щоб запускати на фіксованій локації, задайте `LOCATION_ID`, `WAITER_EMAIL`, `WAITER_PASSWORD` (паролі з `#` беріть у лапки).

## Запуск

```bash
npm test            # усі тести
npm run test:l1     # рівень 1 (@level1)
npm run test:l2     # рівень 2 (@level2)
npm run test:l3     # рівень 3 (@level3)
npm run test:ui     # лише UI (@ui)
npm run test:api    # лише API (@api)
npx playwright test --grep "@level2.*@api"   # комбінація тегів
npm run report      # відкрити HTML-звіт
```

## Звіти

- HTML-звіт: `playwright-report/index.html`; JUnit: `test-results/junit.xml`.
- Для впалих тестів: скриншот, відео й trace у `test-results/` (`npx playwright show-trace <trace.zip>`).

## CI (⭐ пайплайн у хмарі)

`.github/workflows/aqa-pipeline.yml` (GitHub Actions, хмарні runner-и GitHub):
- job **unit-tests** — unit-тести бекенду (`dotnet test`), тести ДЗ фронтенду (headless Chrome) і production build;
- job **e2e** — UI + API тести проти розгорнутого застосунку; на push, PR, щотижня за розкладом і вручну (`workflow_dispatch` з полем `grep` для підмножини);
- впалий тест не зупиняє пайплайн (`continue-on-error`), HTML-звіт і traces/скриншоти/відео публікуються як artifacts, підсумок — у вкладці Checks.

Адреси середовища можна перевизначити змінними репозиторію `FRONTEND_URL`, `API_BASE_URL` (Settings → Secrets and variables → Actions → Variables).

## ⭐ Report Portal

Репортер `@reportportal/agent-js-playwright` підключається автоматично, якщо задані `RP_ENDPOINT`, `RP_PROJECT`, `RP_API_KEY` (локально в `.env`, у CI — змінні `RP_ENDPOINT`, `RP_PROJECT` і секрет `RP_API_KEY`). Report Portal можна підняти локально в Docker за [офіційним docker-compose](https://reportportal.io/docs/installation-steps/DeployWithDocker/) або використати хмарний інстанс.
