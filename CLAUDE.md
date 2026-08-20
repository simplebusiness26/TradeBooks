# Claude Code Instructions — TradeBooks

## Mission
Build TradeBooks V1 into a production-ready mobile-first bookkeeping/back-office app for UK trades, starting with roofing. The app should remove most day-to-day bookkeeping admin while keeping accounting/tax-sensitive decisions reviewable by a human.

## Start path
Read `START-HERE.md` first, then:
1. `PRODUCT.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `CONNECTIONS_REQUIRED.md`

Do not waste tokens searching other branches unless one of these files is missing.

## Non-negotiable product rule
TradeBooks is standalone-first.

It must function without Xero, QuickBooks, FreeAgent or any external accounting package. TradeBooks owns its own canonical operational bookkeeping data and workflows.

External accounting systems are optional integration adapters for customers who already use them. They must never be architectural dependencies.

## Working rules
- Do not stop for minor product decisions. Choose the simplest sensible production-quality option and document important decisions.
- Do not invent credentials, API keys, bank data, HMRC credentials, accounting connections or production secrets.
- Anything requiring owner credentials must be fully scaffolded and listed in `CONNECTIONS_REQUIRED.md` with exact setup steps.
- Keep the customer UI extremely simple. The owner should not need bookkeeping knowledge.
- Use plain language such as “Money in”, “Money out”, “Who owes me”, “Bills to pay”, “Receipts”, “Jobs”, “Ask me”.
- Every important workflow must work with seeded demo/local data before external integrations are connected.
- Build for multi-tenant use from day one.
- Keep an auditable trail for automated categorisation, edits, approvals and reconciliations.
- AI suggestions must never silently make irreversible financial/compliance decisions.
- Prioritise reliability, security, data integrity and clear failure states over cleverness.
- Prefer deterministic rules before LLM calls.
- Keep AI/provider integration behind adapters.
- Never block core bookkeeping because AI or an external provider is unavailable.
- Use integer minor units or decimal-safe money handling. Never store financial amounts as binary floating point.

## Definition of done for this build
The app must run locally and in a deployable environment with demo data and include:
- authentication
- company/tenant separation
- database schema/migrations
- dashboard
- customers and suppliers
- invoices and payments
- bills/expenses
- transactions and reconciliation state
- receipt/document capture and matching
- jobs and job profitability
- subcontractors/CIS preparation
- VAT overview/preparation
- Ask Me exception queue
- categorisation/learned rules
- audit history
- accountant/reviewer workspace
- settings/onboarding
- responsive mobile UX
- validation/error states
- tests for critical financial/security flows
- import/export paths
- optional integration adapter layer

External systems that cannot be connected without credentials must have production-shaped adapters/mocks and clear connection instructions.

## Execution style
Work through `BUILD_PLAN.md` in order. Update milestone statuses as work completes. Test after each meaningful milestone. Fix failures before moving on. Do not rewrite working areas unnecessarily.

At the end, produce `HANDOVER.md` containing:
- what is complete
- what is verified
- remaining credential-dependent integrations
- exact owner actions in order
- deployment steps
- known limitations

The objective is the most complete working TradeBooks V1 possible without owner intervention.