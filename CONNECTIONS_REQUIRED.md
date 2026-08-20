# TradeBooks — Connections Required

This file is the owner handoff checklist for anything Claude Code cannot safely complete without real credentials, account setup, legal/business choices or production access.

Claude Code must keep this current. Do not block development on these items; scaffold adapters/mocks and continue.

## Important rule
No external accounting package is required for TradeBooks core functionality.

Xero, QuickBooks and FreeAgent are OPTIONAL. If the customer uses one, connect it later. If they use none, TradeBooks still works.

## 1. Production database
Status: NOT CONNECTED
Needed before live use:
- PostgreSQL connection string
- production environment variables
- migration execution

## 2. Authentication production configuration
Status: NOT CONNECTED
May require:
- production base URL/domain
- auth secret(s)
- email provider for reset/login email if chosen

Demo/local auth must work without this.

## 3. Receipt/document storage
Status: NOT CONNECTED
Choose production object storage later. The app must use a storage adapter so provider choice does not affect bookkeeping logic.

## 4. Bank feed / Open Banking — OPTIONAL FOR FIRST BUILD
Status: NOT CONNECTED
Purpose:
- automatic bank transaction import
- refreshed balances
- matching/reconciliation assistance

Until connected:
- manual transactions work
- CSV import works
- downstream bookkeeping workflows remain functional

## 5. Accounting-package connectors — OPTIONAL
Status: NOT CONNECTED
Possible connectors:
- Xero
- QuickBooks
- FreeAgent

Only connect one if the roofing business already uses it or later chooses it.

Requirements:
- adapter boundary
- OAuth/app credentials where required
- idempotent external-ID mappings
- category/tax-code mapping
- safe sync/export behaviour

Do not make any of these packages the source of truth for core TradeBooks workflows.

## 6. Receipt OCR / document extraction — OPTIONAL ENHANCEMENT
Status: NOT CONNECTED
Purpose: extract supplier/date/amount/VAT from receipt photos.

Build provider interface plus deterministic/demo fallback first.

## 7. AI provider — OPTIONAL
Status: NOT CONNECTED
AI is assistance, not a dependency.

Potential uses:
- ambiguous categorisation suggestions
- messy document interpretation
- natural-language explanations

Requirements:
- provider adapter
- validated structured outputs
- confidence/reason metadata
- no silent high-risk financial/compliance decisions
- deterministic rules before LLM calls

## 8. Email / notifications — OPTIONAL UNTIL LIVE
Status: NOT CONNECTED
Potential uses:
- invoice reminders
- missing-document reminders
- account emails
- owner/reviewer notifications

## 9. HMRC / statutory submission
Status: NOT CONNECTED — DO NOT FAKE
V1 prepares/reviews VAT and CIS data but must not claim direct submission capability unless a real authorised integration is later implemented and verified.

## 10. Live company configuration
Status: NOT PROVIDED
Collect from the roofing company later:
- legal/trading name
- company type/number if applicable
- business address/contact details
- VAT registration status/number/scheme if applicable
- CIS contractor/subcontractor status/settings
- financial year/accounting periods
- current customers/suppliers/subcontractors/jobs
- outstanding invoices/bills
- whether they currently use Xero, QuickBooks, FreeAgent or none
- current bookkeeper/accountant workflow
- exactly what the existing £800/month service includes

Do not make these up. Seed clearly labelled demo values.

## Owner morning goal
`HANDOVER.md` should reduce this to the shortest possible ordered checklist: create/connect account -> paste exact value -> run/test exact action -> verify success.