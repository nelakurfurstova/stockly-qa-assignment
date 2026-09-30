# Stockly – QA assignment (Playwright)

Automated smoke/regression tests for the Stockly inventory app (https://stockly-azure-ten.vercel.app/).

## Setup
```bash
npm install
npx playwright install chromium
cp .env.example .env      # Windows: copy .env.example .env
# then put the password from the assignment email into .env (STOCKLY_PASSWORD)
```
The app uses HTTP Basic Auth; credentials are passed via `httpCredentials` in `playwright.config.ts`.

## Run
| Command | What it does |
|---|---|
| `npm test` | all 29 tests (20 API + 9 UI) |
| `npm run test:smoke` | smoke tests only (`@smoke`, 11 tests) |
| `npm run test:regression` | regression tests only (`@regression`, 18 tests) |
| `npm run test:api` | API tests only (fast, no browser) |
| `npm run test:e2e` | UI tests in Chromium (headless) |
| `npm run test:headed` | UI tests in a visible Chromium window |
| `npm run test:ui` | Playwright UI mode (debugging) |
| `npm run report` | open the HTML report |
| `npx tsc --noEmit` | type check (uses `tsconfig.json`) |

## Smoke vs. regression
Every test is tagged in its title with either `@smoke` or `@regression`.

| | Smoke (`@smoke`) | Regression (`@regression`) |
|---|---|---|
| Tests | 11 (6 API + 5 UI) | 18 (14 API + 4 UI) |
| Covers | Main happy paths: auth 401 for read/write, paginated list, create (server-computed status), update persists, stock +1/−1; UI list with status badge and summary, SKU filter + Clear, add product + reload, Increase/Decrease stock, Edit + reload | Edge cases: SKU/name filters, invalid inputs, duplicate SKU, name length, status boundaries (0, 5/6), invalid stock deltas, stock below zero; UI empty state, required fields, negative price, pagination |
| When it runs | On every push to `main` and manually in CI; locally before each change | Locally before a release or after larger changes (`npm run test:regression` or `npm test`) |

## CI
`.github/workflows/playwright.yml` runs `npm run test:smoke` on every push to `main` and manually
(`workflow_dispatch`), and uploads `playwright-report` as an artifact even when tests fail.
Before it can run, set these in the GitHub repository (Settings → Secrets and variables → Actions):
- secret `STOCKLY_PASSWORD`: the app password,
- variable `BASE_URL`: the app URL (if it is missing, the workflow falls back to https://stockly-azure-ten.vercel.app).

## Approach
**Automated (smoke/regression, meant to run often):** authentication, product list and pagination,
SKU and name filters and empty state, create/update with server-side validation, duplicate SKU, stock +/- and
status thresholds (0, 1–5, 6+), and the main UI flows (add, edit, quantity buttons, persistence after reload).
These are stable, repeatable and cheap to run on every change.

**Left for manual/exploratory testing:** layout and responsiveness, unusual inputs (HTML/script payloads,
very long values, special characters), race conditions, UX details. See the bug report.

**Known defects are not part of this suite.** They are documented in the bug report. In a real project I would also
automate the critical ones; here the suite is intentionally a green smoke suite.

## Notes
- The tests run serially (`workers: 1`) because they share one backend.
- Products cannot be deleted persistently in the app, so each test creates uniquely named data (`QA-auto-<id>`).
  Each run therefore adds QA-auto-* products to the shared app and the list grows over time;
  this is a limitation of the app under test.
- Never commit `.env`.
