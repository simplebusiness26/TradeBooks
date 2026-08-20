# START HERE — TradeBooks

## If you are Claude Code
Do not ask the owner to find or change branches.

You are in the correct repository. Treat this repository's current branch as the working branch unless there is a genuine technical reason not to. Do not spend tokens searching other branches for instructions unless a required file is missing.

Read these files once, in this order:
1. `CLAUDE.md`
2. `PRODUCT.md`
3. `ARCHITECTURE.md`
4. `BUILD_PLAN.md`
5. `CONNECTIONS_REQUIRED.md`

Then start building immediately.

## Critical architecture rule
TradeBooks is STANDALONE-FIRST.

TradeBooks must work without Xero, QuickBooks, FreeAgent, or any other accounting package. Its own database is the canonical operational bookkeeping record for customers, suppliers, jobs, invoices, bills/expenses, receipts, transactions, payments, categories, VAT data, CIS data, reconciliations, exceptions, learned rules and audit history.

Xero, QuickBooks, FreeAgent and similar products are OPTIONAL adapters for sync/export/migration where a customer already uses them. No core workflow may depend on one.

## Execution instruction
Inspect the current repository only enough to understand what already exists. Sanity-check the source-of-truth docs for genuine contradictions, make only necessary corrections, then execute `BUILD_PLAN.md` milestone by milestone.

Do not stop for routine implementation decisions. Choose the safest, simplest production-quality option, document important decisions, test them and continue.

Anything requiring credentials, external accounts, API keys, financial-provider onboarding, HMRC access, production secrets or owner-only information must be fully scaffolded, added to `CONNECTIONS_REQUIRED.md` with exact setup steps, and skipped so development can continue.

Do not invent credentials. Do not fake integrations. Do not claim an external service is connected when it is not.

Keep `BUILD_PLAN.md` statuses current. Before stopping, run the full tests and production build, fix failures, verify critical workflows end-to-end and create/update `HANDOVER.md`.

## Token-efficiency rule
Do not repeatedly restate the product brief in chat. Use these repository documents as persistent context. Prefer targeted inspection and implementation. Reserve deeper reasoning for architecture, financial correctness, security, difficult bugs and irreversible decisions.