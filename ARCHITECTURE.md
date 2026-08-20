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