# TradeBooks V1 — Build Plan

Every milestone below is complete and verified. See `HANDOVER.md` for what was built, what was
tested, and the short list of things that need the owner.

Verification commands:
- `npm run typecheck` — TypeScript in strict mode
- `npm run test` — unit and integration tests against a real PostgreSQL database
- `npm run build` — production build
- `npm run test:e2e` — browser journeys on mobile and desktop viewports
- `npm run verify` — all of the above in order

## Milestone 0 — Foundation
Status: COMPLETE
- initialise app/tooling
- TypeScript strict mode
- database + migrations
- authentication/session system
- company/tenant + roles
- environment validation
- test framework
- demo seed system
- health endpoint
- responsive mobile shell/navigation

Exit: app starts, DB migrates/seeds, demo user signs in, tenant separation proven by tests.

## Milestone 1 — Canonical bookkeeping records
Status: COMPLETE
Build production-shaped CRUD/domain flows for:
- companies/users
- customers
- suppliers
- subcontractors
- jobs
- categories
- transactions
- invoices/invoice lines
- payments
- bills/expenses
- receipt/document metadata
- reconciliation/review state

Add audit events for meaningful changes.

Exit: seeded roofing business can create/edit/view all core records without any external accounting package.

## Milestone 2 — Import/export foundation
Status: COMPLETE
- manual transaction entry
- CSV transaction import
- safe duplicate/idempotency handling
- CSV exports for core records where useful
- accountant-ready export bundle shape

Exit: a business with no integrations can get its bookkeeping data into and out of TradeBooks.

## Milestone 3 — Owner dashboard
Status: COMPLETE
Build plain-English mobile dashboard:
- cash/bank position from available records
- money owed
- bills due
- monthly income/cost/profit
- estimated VAT position
- Ask Me count
- missing receipts
- period/deadline cards where configured

Exit: all figures derive from canonical TradeBooks records and calculations are tested.

## Milestone 4 — Money In
Status: COMPLETE
- customer invoices
- paid/unpaid/part-paid/overdue states
- payment allocation/matching
- invoice detail/document output
- customer balance/history
- reminder/chasing state via mock/provider adapter

Exit: invoice -> payment -> paid/overdue lifecycle works without external software.

## Milestone 5 — Money Out + categorisation
Status: COMPLETE
- transaction list/detail
- bills/expenses
- category assignment
- supplier mapping
- job allocation
- VAT treatment fields
- deterministic categorisation rules
- confidence/reason metadata
- status: processed / needs receipt / needs answer / reviewed

Exit: known suppliers auto-categorise without AI; ambiguous items generate exceptions.

## Milestone 6 — Receipts/documents
Status: COMPLETE
- mobile camera/file upload UX
- original preservation
- storage abstraction + local/mock
- extraction interface + demo/mock
- supplier/date/net/VAT/gross fields
- candidate transaction matching
- safe auto-match threshold
- ambiguous/missing match -> Ask Me

Exit: receipt capture and matching work end-to-end without paid providers.

## Milestone 7 — Ask Me engine
Status: COMPLETE
- persisted exception model
- queue with priority/status
- one-tap candidate answers
- custom answer
- resolution actions
- audit history
- safe reusable rule creation

Exit: seeded exceptions can be resolved from phone and underlying records update correctly.

## Milestone 8 — Jobs & profitability
Status: COMPLETE
Per job show:
- customer/address/status
- quote/expected revenue
- invoices/payments
- materials
- subcontractor/labour
- other costs
- profit + margin
- unallocated/uncertain costs
- linked receipts/transactions

Exit: profitability calculations are tested and reconcile to linked records.

## Milestone 9 — CIS workspace
Status: COMPLETE
- subcontractor records
- UTR/reference fields
- verification metadata
- payment periods
- labour/material components
- deduction fields/calculations
- net payment
- readiness checklist
- export/review-ready summary
- PREPARED/NOT FILED language

No autonomous HMRC submission.

Exit: monthly demo CIS period can be prepared/reviewed with audit history.

## Milestone 10 — VAT workspace
Status: COMPLETE
- VAT registration/settings
- VAT on sales/purchases from recorded treatments
- period summary
- estimated payable/repayable position
- missing evidence/uncertain treatment warnings
- readiness checklist
- export/review workflow
- estimate/prepared/filed states

Exit: VAT demo period derives from canonical records and tests cover calculations/status logic.

## Milestone 11 — Accountant/reviewer workspace
Status: COMPLETE
- richer transaction/reconciliation view
- unresolved exceptions
- missing documents
- audit history
- categorisation rules
- integration health
- period-close checklist
- useful exports

Exit: reviewer can inspect/resolve the month without using owner UI.

## Milestone 12 — Optional integrations layer
Status: COMPLETE
Implement interfaces and production-shaped adapters/stubs for:
- bank/open banking feed
- Xero
- QuickBooks
- FreeAgent
- document OCR/extraction
- AI suggestion provider
- email/notification delivery
- object storage
- future HMRC-compatible submission boundary

Rules:
- core app must work with zero external credentials
- provider-specific logic stays at adapter boundaries
- external IDs are mappings, not canonical identities
- no accounting package is required

Exit: each integration has one clear connection point and documented credentials; disconnecting all of them leaves core TradeBooks functional.

## Milestone 13 — Security, resilience and quality
Status: COMPLETE
- tenant isolation tests
- authorisation tests
- validation/error handling
- safe money arithmetic
- file-upload validation
- rate limiting where appropriate
- idempotency for imports/background work
- empty/loading/error states
- accessibility basics
- mobile layout testing
- deterministic fixtures
- critical-flow integration tests

Exit: no known critical/high security or data-integrity defect remains.

## Milestone 14 — Deployment/handover
Status: COMPLETE
- production build passes
- migration path documented
- `.env.example`
- seed/demo workflow
- deployment instructions
- `HANDOVER.md`
- exact owner credential actions ordered and minimal
- known limitations

Exit: owner can return, follow one checklist, connect optional/required production services and proceed without Claude rediscovering the project.

## Build priorities if constrained
1. data integrity/security
2. complete standalone end-to-end core flows
3. simple mobile UX
4. tests/verification
5. integration scaffolding
6. polish

Do not sacrifice correctness or workflow completeness for decorative features.