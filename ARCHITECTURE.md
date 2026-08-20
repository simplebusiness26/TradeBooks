# TradeBooks — Architecture

## Goal
Production-shaped V1 that works fully with local/demo/manual data and is ready to connect external services without rewriting the product.

## Core architecture rule
TradeBooks is standalone-first.

The TradeBooks database is the canonical operational bookkeeping store. Xero, QuickBooks, FreeAgent and similar products are optional integration adapters, not dependencies.

If no accounting package is connected, the owner must still be able to run all V1 workflows: customers, invoices, payments, expenses, transactions, receipts, jobs, categorisation, reconciliations, VAT/CIS preparation, Ask Me, audit history, exports and reviewer workflow.

## Recommended shape
Use a modern TypeScript full-stack web application optimised for mobile browsers and installable/PWA-style use where practical.

Preferred defaults unless compatibility gives a strong reason otherwise:
- Next.js App Router + TypeScript
- PostgreSQL
- strongly typed ORM + migrations
- established server-side authentication/session tooling
- object-storage abstraction for receipts/documents
- background-job abstraction for import/OCR/matching work
- schema validation at all input boundaries
- automated unit/integration tests for critical financial workflows

Claude may choose maintained libraries after compatibility checks, but avoid unnecessary framework churn and document meaningful deviations.

## 1. Domain layer
Keep bookkeeping domain logic separate from UI and providers. Core services should own:
- transaction classification
- receipt matching
- invoice/payment state
- bill/expense state
- reconciliation state
- job profitability
- exception generation/resolution
- CIS record calculations/preparation
- VAT summary preparation
- audit events
- import/export mappings

## 2. Canonical internal ledger/records
TradeBooks must maintain its own durable canonical records rather than delegating core state to Xero or another package.

This does not require pretending to be regulated accounting/tax software. It does require robust internal records, balanced/traceable states where applicable, audit history and exports suitable for professional review.

External-ledger sync must map to/from these canonical records through adapters.

## 3. Integration adapters
External dependencies must sit behind interfaces/adapters:
- accounting package: Xero / QuickBooks / FreeAgent / future providers
- bank/open-banking feed
- receipt OCR/document extraction
- AI provider
- email/reminder delivery
- object/file storage
- HMRC-compatible submission layer later if approved

The core app must remain usable when every optional provider is unavailable.

## 4. Multi-tenancy
All business data belongs to a company/tenant. Enforce tenant scoping server-side on every read/write. Never trust client-supplied tenant IDs without authorisation checks.

Roles for V1:
- owner/admin
- staff
- bookkeeper/accountant reviewer

## 5. Data integrity
Financial records require durable IDs and timestamps. Prefer audit/reversal patterns where deletion would destroy history.

Money must use integer minor units or decimal-safe handling; never binary floating point.

Store:
- source of imported/generated data
- automation method/rule
- confidence/reason where applicable
- original user/provider values where transformations occur
- human confirmation/rejection
- external provider IDs only as mappings, never as the sole identity of core records

## 6. Ask Me engine
Exceptions are first-class persisted records.

Each exception has:
- type
- subject record
- human-readable question
- candidate answers where possible
- status
- priority
- created/resolved timestamps
- resolution
- resolver
- rule learned/created, if any

Resolving an exception triggers deterministic domain actions and an audit event.

## 7. Categorisation engine
Order:
1. exact reusable rules
2. historical supplier/customer mapping
3. matching heuristics/context
4. optional AI suggestion
5. Ask Me

Do not spend LLM tokens on records already resolved deterministically.

## 8. Receipts/documents
Persist metadata plus an object-storage abstraction. Local/dev mode can use a local/mock storage adapter.

Pipeline:
upload -> preserve original -> validate -> extract -> identify supplier/date/amount/VAT -> candidate transaction matches -> safe auto-match or Ask Me.

## 9. Transactions & reconciliation
Support manual entry and CSV import immediately. Build canonical transaction models that future bank/accounting adapters map into.

A transaction may link to:
- supplier/customer
- receipt/document
- bill/invoice/payment
- job
- category
- VAT treatment
- CIS/subcontractor context

Track reconciliation/review status explicitly.

## 10. Jobs/profitability
Job profitability is a first-class TradeBooks feature. Attribute revenue and costs to jobs and calculate margin from canonical monetary records. Keep unallocated costs visible.

## 11. Accounting-package sync policy
Optional connectors must support safe sync/export patterns and idempotent external IDs.

Do not allow provider-specific tax/category codes to leak throughout the domain. Map them at adapter boundaries.

If a customer has no accounting package, no functionality is lost.

If a customer already has one, TradeBooks can become the simple owner-facing workflow while synchronising/exporting records as configured.

## 12. Security
- server-side authorisation on every mutation
- secure established auth tooling
- CSRF/session protections appropriate to framework
- rate-limit sensitive endpoints
- validate file type/size
- no secrets committed
- fail-fast environment validation
- safe logging
- audit security-sensitive settings changes
- tenant isolation tests

## 13. Compliance posture
TradeBooks organises and prepares records and may calculate summaries from user records. It must clearly distinguish:
- estimate vs filed liability
- prepared vs submitted return
- AI suggestion vs user-confirmed treatment

Do not claim regulatory approval or filing capability unless a real verified integration exists.

## Deployment readiness
Provide:
- `.env.example`
- database migrations and seed command
- health endpoint
- production build command
- deployment documentation
- provider adapters with local/mock fallback
- idempotent seed/demo setup where practical
- manual/CSV import-export path

Cloud/provider choice should not create unnecessary lock-in.
---

# As built — decisions taken during the V1 build

This section records the concrete choices made against the plan above, and why. The specification
before it is unchanged.

## Stack
- **Next.js 15 (App Router) + React 19 + TypeScript strict.** Server Components for reads, Server
  Actions for writes, so there is no separate API surface to keep in step with the UI. `strict`,
  `noUncheckedIndexedAccess` and `noImplicitOverride` are all on.
- **PostgreSQL + Drizzle ORM** with generated SQL migrations in `drizzle/`. Drizzle keeps the
  schema in TypeScript, so column types and query results stay checked end to end.
- **Zod** at every input boundary — server actions, CSV rows, adapter responses and environment.
- **Tailwind CSS v4** with a small set of primitives in `src/components/ui/`. No component library,
  because the UI is deliberately plain and the tap-target and contrast rules are easier to hold
  with our own primitives.
- **Vitest** for unit and integration tests against a real PostgreSQL database, **Playwright** for
  browser journeys on a phone and a desktop viewport.

## Authentication
Built in rather than delegated, so the product has no third-party identity dependency:
- Passwords hashed with **scrypt** from Node's standard library — no native module to compile, no
  platform-specific binary, and a recognised KDF.
- Sessions are server-side rows; only the SHA-256 digest of the token is stored, so a database leak
  cannot be replayed as a login.
- Sign-in is rate limited per IP and per email, and an account locks for 15 minutes after repeated
  failures. Failed sign-in returns one message regardless of whether the account exists.

## Money
Integer pence throughout, with `src/lib/money.ts` as the only place arithmetic happens. Parsing
from user input and CSV works on the decimal string, never `parseFloat`. `splitGross` derives net
first and takes VAT as the remainder, so `net + vat === gross` holds at every amount. Allocation
across weights redistributes the rounding drift so a total is never lost or invented.

## Dates
Business dates are `YYYY-MM-DD` strings, never `Date` objects, so a receipt dated 1 April cannot
become 31 March because the server runs in UTC. CIS tax months (6th to 5th), VAT periods anchored
to the company's own period end, and the "one calendar month and seven days" VAT deadline are all
implemented and tested, including across a British Summer Time change.

## Internal ledger
The plan asked for balanced and traceable states where applicable. That is implemented as a
compact double-entry journal (`journal_entries` / `journal_lines`) with a small system chart of
accounts, posted automatically from invoices, bills and bank transactions.

- Postings are keyed by an idempotent `postingKey`, so editing a source record replaces its entry
  rather than duplicating it, and cancelling a record removes it.
- A transaction that settles a bill or an invoice posts against creditors or debtors rather than
  the expense or income account, so a cost is never counted twice.
- The reviewer sees a real trial balance, and the tests assert debits equal credits after every
  workflow.

The owner never sees any of this. It exists so integrity is checkable rather than assumed.

## The confidence ladder
Implemented in `src/domain/categorisation.ts` exactly in the order the plan specifies: exact rule,
then supplier/customer history, then name and amount matching, then an optional AI provider, then
Ask Me. `AUTO_APPLY_THRESHOLD` is 80; below it nothing is applied, it becomes a question. An AI
suggestion is capped below that threshold by construction, so it can never auto-apply. A record a
person has confirmed is never re-decided.

Deterministic steps cost nothing and run first, so routine transactions never reach a model.

## Matching
Receipt-to-payment and payment-to-invoice matching score on amount, date proximity and name
similarity, and only auto-apply at a high score **and** a clear margin over the runner-up. Every
point of the score is turned into plain English ("the amount matches exactly, same day and same
supplier") and shown to the owner, so an automatic decision is always explainable.

## Receipts
The built-in extractor parses text and emailed receipts for real. Photographs are reported as
unsupported rather than guessed at, and the owner is asked for the two details needed; TradeBooks
then finds the payment itself. Extraction never overwrites a value a person has entered, and the
original file is written once and never modified.

## Adapters
Storage, OCR, AI, email, bank feed and three accounting packages each sit behind an interface with
a working local default. The accounting mappings are real and unit-tested even though the OAuth
transport is not implemented — the mapped payload can be downloaded today. Provider-specific tax
codes exist only inside adapters.

## Background work
Import, extraction and matching run synchronously inside the request. For the volumes a trade
business produces — a monthly statement is tens to hundreds of lines — this is faster and far more
reliable than a queue with no worker process to run it. The per-row work is isolated in
`autoProcessTransaction` and `processDocument`, so moving it behind a queue later is a contained
change. That trade-off is recorded in `HANDOVER.md` rather than hidden.

## Loading states
There is deliberately **no route-level `loading.tsx`**. A Suspense boundary around a segment that
contains a Server Action form interacts badly with `revalidatePath`: the refresh suspends the
segment, the action's transition never settles, and `useActionState` stays pending forever — so the
submit button sticks on "Saving…" and the success message never appears, even though the write
succeeded. This was caught by the browser suite, reproduced, and confirmed by removing the
boundary.

Loading feedback instead lives on the control the person is using: every submit button reports its
own pending state. Pages are server-rendered and their queries are indexed, so navigation is a
single fast round trip rather than a shell plus a fetch.

## Deliberate omissions
- **No HMRC submission.** Preparation only, stated plainly on every screen.
- **No payment initiation.** Payments are recorded, never made.
- **Flat-rate VAT is recorded but calculated on the standard basis**, with a visible warning.
- **The rate limiter is in-process**, which is correct for a single instance and documented as a
  scale-out item.
