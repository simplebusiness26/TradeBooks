# TradeBooks V1 — Build Plan

Claude Code should execute this plan in order, updating each milestone status as work is completed.

## Milestone 0 — Foundation
Status: NOT STARTED

- initialise application and tooling
- TypeScript strict mode
- database and migrations
- authentication/session system
- company/tenant model and role model
- environment validation
- test framework
- seed/demo-data system
- health endpoint
- responsive shell/navigation

Exit criteria: app starts cleanly, database migrates/seeds, demo user can sign in, tenant separation is proven by tests.

## Milestone 1 — Core records
Status: NOT STARTED

Build production-shaped CRUD/domain flows for:
- companies/users
- customers
- suppliers
- subcontractors
- jobs
- categories
- transactions
- invoices and invoice lines
- payments
- supplier bills/expenses
- documents/receipts metadata

Add audit events for meaningful changes.

Exit criteria: seeded roofing business can create/edit/view all core records without external integrations.

## Milestone 2 — Owner dashboard
Status: NOT STARTED

Build the plain-English mobile dashboard:
- cash/bank position from available records
- money owed
- bills due
- monthly income/cost/profit
- estimated VAT position
- Ask Me count
- missing receipts
- period/deadline cards where configured

Exit criteria: all figures derive from canonical records and are covered by calculation tests.

## Milestone 3 — Money In
Status: NOT STARTED

- customer invoices
- paid/unpaid/part-paid/overdue states
- payment allocation/matching
- invoice detail
- invoice document output/share/download if practical
- customer balance/history
- reminder/chasing state (delivery adapter may remain mock)

Exit criteria: full invoice -> payment -> paid/overdue lifecycle works with demo data.

## Milestone 4 — Money Out + categorisation
Status: NOT STARTED

- transaction list/detail
- bills/expenses
- category assignment
- supplier mapping
- job allocation
- VAT treatment fields
- deterministic categorisation rules
- confidence/reason metadata
- status: processed / needs receipt / needs answer / reviewed

Exit criteria: known suppliers auto-categorise without AI; unknown/ambiguous items generate exceptions.

## Milestone 5 — Receipts/documents
Status: NOT STARTED

- mobile camera/file upload UX
- original document preservation
- storage abstraction + local/mock implementation
- extraction interface + mock/demo implementation
- supplier/date/net/VAT/gross fields
- candidate transaction matching
- safe auto-match threshold
- missing/ambiguous matches route to Ask Me

Exit criteria: receipt capture and matching works end-to-end without needing a paid external service.

## Milestone 6 — Ask Me engine
Status: NOT STARTED

- exception data model
- queue with priorities/status
- one-tap candidate answers
- custom answer where needed
- resolution actions
- audit history
- safe reusable rule creation from confirmed answers
- never create broad unsafe rules automatically

Exit criteria: seeded exceptions can be resolved from phone and underlying financial records update correctly.

## Milestone 7 — Jobs & profitability
Status: NOT STARTED

Per job show:
- customer/address/status
- quote/expected revenue
- invoices/payments
- materials
- subcontractor/labour
- other costs
- profit and margin
- unallocated/uncertain costs
- linked receipts/transactions

Exit criteria: profitability calculations are tested and reconcile to linked records.

## Milestone 8 — CIS workspace
Status: NOT STARTED

- subcontractor records
- UTR/reference fields
- verification status metadata
- payment periods
- labour/material components where relevant
- deduction fields/calculations
- net payment
- period readiness checklist
- export/review-ready summary
- clear PREPARED/NOT FILED language

No autonomous HMRC submission.

Exit criteria: a monthly demo CIS period can be prepared and reviewed with complete audit history.

## Milestone 9 — VAT workspace
Status: NOT STARTED

- VAT registration/settings fields
- VAT on sales/purchases from recorded treatments
- period summary
- estimated payable/repayable position
- missing evidence/uncertain treatment warnings
- period readiness checklist
- export/review workflow
- clearly distinguish estimate/prepared/filed states

Exit criteria: VAT demo period derives from canonical records and tests cover calculations/status logic.

## Milestone 10 — Accountant/reviewer workspace
Status: NOT STARTED

- richer transaction/reconciliation view
- unresolved exceptions
- missing documents
- audit history
- categorisation rules
- integration health
- period-close checklist
- useful exports

Exit criteria: a reviewer can inspect and resolve the month without using the owner UI.

## Milestone 11 — Integrations layer
Status: NOT STARTED

Implement interfaces and production-shaped adapters/stubs for:
- bank/open banking feed
- accounting ledger
- document OCR/extraction
- AI suggestion provider
- email/notification delivery
- object storage
- HMRC-compatible future adapter boundary

All credential-dependent pieces must degrade to demo/mock mode and be documented in `CONNECTIONS_REQUIRED.md`.

Exit criteria: core app works with zero external credentials; each real integration has one clear connection point instead of business logic spread around the codebase.

## Milestone 12 — Security, resilience and quality
Status: NOT STARTED

- tenant isolation tests
- authorisation tests
- validation/error handling
- safe money arithmetic
- file upload validation
- rate limiting where appropriate
- idempotency for imports/background work where appropriate
- empty/loading/error states
- accessibility basics
- mobile layout testing
- deterministic test fixtures
- critical-flow integration tests

Exit criteria: no known critical/high security or data-integrity defect remains.

## Milestone 13 — Deployment/handover
Status: NOT STARTED

- production build passes
- database migration path documented
- `.env.example`
- seed/demo workflow
- deployment instructions
- `HANDOVER.md`
- exact owner credential actions ordered and minimal
- known limitations

Exit criteria: owner can return, follow one checklist, connect required services and proceed without needing Claude to rediscover the project.

## Build priorities if constrained
1. data integrity/security
2. complete end-to-end core flows
3. simple mobile UX
4. tests/verification
5. integrations scaffolding
6. polish

Do not sacrifice correctness or core workflow completeness to create decorative features.
