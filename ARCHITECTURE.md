# TradeBooks — Architecture

## Goal
Production-shaped V1 that works fully with demo/local data and is ready to connect external services without rewriting the product.

## Recommended shape
Use a modern TypeScript full-stack web application optimised for mobile browsers and installable/PWA-style use where practical.

Preferred defaults unless the existing codebase later gives a strong reason otherwise:
- Next.js App Router + TypeScript
- PostgreSQL
- an ORM with migrations and strong typing
- server-side authentication/session handling
- object storage abstraction for receipts/documents
- background job abstraction for OCR/import/matching work
- schema validation at all input boundaries
- automated unit/integration tests for critical financial workflows

Claude may choose specific maintained libraries after checking compatibility, but should avoid unnecessary framework churn and document deviations.

## Architectural boundaries
### 1. Domain layer
Keep bookkeeping domain logic separate from UI and external providers. Core services should own:
- transaction classification
- receipt matching
- invoice/payment state
- job profitability
- exception generation/resolution
- CIS record calculations/preparation
- VAT summary preparation
- audit events

### 2. Integration adapters
External dependencies must sit behind interfaces/adapters:
- accounting ledger: Xero / QuickBooks / FreeAgent later
- bank/open-banking feed later
- receipt OCR/document extraction
- AI provider
- email/reminder delivery
- object/file storage
- HMRC-compatible submission layer later if approved

The core app must remain usable when any optional provider is unavailable.

### 3. Multi-tenancy
All business data belongs to a company/tenant. Enforce tenant scoping server-side on every read/write. Never trust client-supplied tenant IDs without authorisation checks.

Roles for V1:
- owner/admin
- staff
- bookkeeper/accountant reviewer

Design so more granular permissions can be added later.

### 4. Data integrity
Financial records require durable IDs and timestamps. Prefer append/audit events for meaningful financial changes. Soft-delete or reversal patterns should be used where deletion would destroy an audit trail.

Money must use decimal/integer minor-unit-safe handling; never rely on binary floating point for stored monetary values.

Store:
- source of imported/generated data
- automation method/rule
- confidence/reason where applicable
- original user/provider values where transformations occur
- human confirmation/rejection

### 5. Ask Me engine
Exceptions are first-class persisted records, not transient UI warnings.

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

### 6. Categorisation engine
Order of operations:
1. exact reusable rules
2. historical supplier/customer mapping
3. matching heuristics/context
4. optional AI suggestion
5. Ask Me

Do not spend LLM tokens on records already resolved by deterministic logic.

### 7. Receipts/documents
Persist metadata plus an object-storage key/URL abstraction. Local/dev mode can use a local/mock storage adapter.

Processing pipeline:
upload -> preserve original -> validate -> extract -> identify supplier/date/amount/VAT -> candidate transaction matches -> auto-match only above safe confidence -> otherwise Ask Me.

### 8. Transactions & reconciliation
Support manual/demo imports immediately. Build canonical transaction models that later adapters can map bank feeds/accounting-ledger data into.

A transaction may link to:
- supplier/customer
- receipt/document
- bill/invoice/payment
- job
- category
- VAT treatment
- CIS/subcontractor context

Track reconciliation/review status explicitly.

### 9. Jobs/profitability
Job profitability is a TradeBooks feature, not merely a view of accounting categories. Attribute revenue and costs to jobs and calculate margin from canonical monetary records. Keep unallocated costs visible.

### 10. Security
- server-side authorisation on every mutation
- secure password/session implementation via established auth tooling
- CSRF/session protections appropriate to chosen framework
- rate-limit sensitive endpoints
- validate file type/size
- no secrets committed
- environment schema with fail-fast validation
- safe logging: do not leak credentials or sensitive financial payloads
- audit security-sensitive settings changes

### 11. Compliance posture
TradeBooks organises and prepares records. It must clearly distinguish:
- estimates vs filed liabilities
- prepared vs submitted returns
- AI suggestion vs user-confirmed treatment

Do not claim regulatory approval or filing capability unless a real integration has been implemented and verified.

## Deployment readiness
Provide:
- `.env.example`
- database migrations and seed command
- health endpoint
- production build command
- deploy documentation
- provider adapters with mock/local fallback
- idempotent seed/demo setup where practical

Cloud/provider choice should not lock the product into a single vendor unnecessarily.
