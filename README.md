# Green & Tasty — Frontend · домашка IT Marathon 6.0

## Розгорнуте середовище (для перевірки)

| Що | Адреса |
|---|---|
| Frontend (CloudFront) | https://d2itb54hfo2xf3.cloudfront.net |
| API (API Gateway, stage `develop`) | https://6p4vdewhse.execute-api.eu-central-1.amazonaws.com/develop |

Як перевірити груповий pre-order (рівень 3, справжній API):
1. **Sign In** / **Create an Account** → **Book a Table** на 2+ гостей (локація *48 Rustaveli Avenue*).
2. **Reservations** → на картці бронювання кнопка **Group Pre-Order** (екран `/reservations/<id>/group-order`); Invite Link — у вікні підтвердження бронювання.
3. Відкрити invite-посилання в іншому браузері / інкогніто — гість додає страви й підтверджує кошик.
4. Зробити власний **Pre-order** (без нього бекенд поверне 400 на submit) → **Submit Pre-Order**.

- Демо-дані середовища: `infra/seed/seed_demo_data.py`.
- Автотести (UI + API, рівні 1–3) і пайплайн: `aqa/restaurant-aqa-framework/README.md`, `.github/workflows/aqa-pipeline.yml`.
- Домашка Backend: `homework-backend.md` (реалізація — `backend/restaurant-backend-app`, unit-тести — `Tests/Services/GroupPreOrderOwnerFlowTests.cs`).

---

Фронтенд застосунку Green & Tasty (Angular 22) — стартовий код для домашнього завдання.
Бекенду в цьому архіві немає: для рівнів 1–2 він не потрібен.

## Старт

Потрібен Node.js 22.22+ або 24.x (див. `frontend/restaurant-frontend-app/.nvmrc`).

```bash
cd frontend/restaurant-frontend-app
npm ci
npm start
```

Відкрий **http://localhost:4200/reservations/demo-reservation/group-order?demo**
(`?demo` — мок-логін: акаунт і бекенд не потрібні). Сторінку з цієї адреси ти зробиш на практичному, а поки тебе перекине на головну. Там будуть помилки завантаження меню й локацій — бекенду в архіві немає, для домашки це нормально.

## Що читати

| Файл | Що там |
|---|---|
| `practice-frontend.md` | практичне на ~15 хв: картка учасника і сторінка — з цього починається домашка |
| `homework-frontend.md` | домашка: 3 рівні, що зробити, умови, тести |
| `homework-design/` | дизайн з Figma (PNG) + що з макета входить у домашку. Оригінал: [Figma](https://www.figma.com/design/P9rkBNLJZ3WabXSQX9b5DO/EPAM-IT-Marathon-6.0?node-id=62645-20592) |
| `frontend/restaurant-frontend-app/homework-tests/` | **готові тести** до практичного і кожного рівня — копіюєш у `src/app/`, запускаєш `npm run test:hw` |
| `homework-backend.md` | контракт API (ті самі ендпоінти, що відповідає мок) |
| `frontend/restaurant-frontend-app/CLAUDE.md` | правила проєкту: куди класти файли, стилі, тести (зручно давати AI-асистенту) |

## Перевірки перед здачею

```bash
cd frontend/restaurant-frontend-app
npx tsc -p tsconfig.app.json  --noEmit
npx tsc -p tsconfig.spec.json --noEmit
BACKEND_URL=https://example.com npm run build
npm run test:hw
```
