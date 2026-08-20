# Claude Code Instructions — TradeBooks

## Mission
Build TradeBooks V1 into a production-ready mobile-first web app for UK trades, starting with roofing. The app should remove most day-to-day bookkeeping admin while keeping regulated/accounting decisions reviewable by a human.

## Source of truth
Read these before coding:
1. `PRODUCT.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `CONNECTIONS_REQUIRED.md`

If implementation and docs conflict, prefer the docs unless the docs are clearly stale; then update them before continuing.

## Working rules
- Do not stop for minor product decisions. Choose the simplest sensible option and document it.
- Do not invent credentials, API keys, bank data, HMRC credentials, accounting connections, or production secrets.
- Anything requiring owner credentials must be fully scaffolded and listed in `CONNECTIONS_REQUIRED.md` with exact setup steps.
- Keep the customer UI extremely simple. The user should not need bookkeeping knowledge.
- Use plain language such as “Money in”, “Money out”, “Who owes me”, “Bills to pay”, “Receipts”, “Jobs”, “Ask me”. Hide accounting jargon unless in the accountant/admin area.
- Every important workflow must work with seeded demo data before external integrations are connected.
- Build for multi-tenant use from day one even though the first live customer is one roofing company.
- Keep an auditable trail for automated categorisation, edits, approvals and reconciliations.
- AI suggestions must never silently make irreversible financial/compliance decisions.
- Prioritise reliability, security, data integrity and clear failure states over cleverness.
- Prefer deterministic rules before LLM calls. Use AI only where it adds real value.
- Keep model/provider integration behind an adapter so it can be changed later.
- Never block core bookkeeping because AI is unavailable.

## Definition of done for this build
The app must run locally and in a deployable environment with demo data, have authentication, company separation, database schema/migrations, dashboard, transactions, receipts, invoices, customers, suppliers, jobs/job profitability, subcontractors/CIS records, VAT overview, Ask Me exception queue, audit history, settings, onboarding, responsive mobile UX, validation, error states and tests for critical flows.

External systems that cannot be connected without credentials must have production-shaped adapters/mocks and clear connection instructions.

## Execution style
Work through `BUILD_PLAN.md` in order. Update its status as milestones complete. Test after each meaningful milestone. Fix failures before moving on. Do not rewrite working areas unnecessarily.

At the end, produce `HANDOVER.md` containing:
- what is complete
- what is verified
- remaining credential-dependent integrations
- exact owner actions in order
- deployment steps
- known limitations
