# TradeBooks

AI-assisted bookkeeping and back-office software for UK trades, starting with roofing.

> "You do the roofing. Take photos of receipts and answer the odd question. TradeBooks keeps the
> books organised."

## What it is

A mobile-first, multi-tenant bookkeeping system that owns its own canonical records. It imports
bank statements, sorts spending using rules it learns from you, matches receipts to payments,
tracks profit per job, prepares VAT and CIS figures, and asks a short question whenever it is not
sure.

**Standalone-first.** TradeBooks works completely without Xero, QuickBooks, FreeAgent, a bank feed,
an OCR service or an AI provider. Those are optional adapters, never dependencies.

## Running it locally

Requires Node 20+ and PostgreSQL 14+.

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate
npm run db:seed               # optional: the demo roofing business
npm run dev                   # http://localhost:3000
```

Demo sign-in (after seeding), password from `SEED_DEMO_PASSWORD`:

| Email | Role |
| --- | --- |
| `owner@northgateroofing.example` | Owner |
| `office@northgateroofing.example` | Staff |
| `accountant@northgateroofing.example` | Bookkeeper / accountant |

## Verifying it

```bash
npm run typecheck   # TypeScript, strict
npm run test        # unit + integration tests (needs a test database)
npm run build       # production build
npm run test:e2e    # browser journeys, mobile and desktop
npm run verify      # all of the above
```

## Documentation

| File | What it covers |
| --- | --- |
| `HANDOVER.md` | **Start here.** What is built, what is verified, and the exact steps you need to do. |
| `CONNECTIONS_REQUIRED.md` | Every external service, what it needs, and what works without it. |
| `PRODUCT.md` | The product specification. |
| `ARCHITECTURE.md` | How it is put together and why. |
| `BUILD_PLAN.md` | The milestone plan, with statuses. |

## Shape of the code

```
src/
  app/            Next.js App Router — screens and server actions
    (auth)/       sign in and sign up
    (app)/        the application, behind the tenant-aware shell
    api/          health, exports, file streaming
  domain/         bookkeeping logic: categorisation, matching, VAT, CIS, jobs, ledger
  adapters/       every external boundary: storage, OCR, AI, email, bank, accounting
  db/             schema, migrations, demo seed
  lib/            money, dates, auth, permissions, validation
tests/            unit and integration tests (real PostgreSQL)
e2e/              browser journeys
```

Money is always integer pence. Dates are `YYYY-MM-DD` strings. Neither ever passes through binary
floating point or a timezone conversion.
