# TradeBooks — Connections Required

This file is the owner handoff checklist for anything Claude Code cannot safely complete without real credentials, account setup, legal/business choices or production access.

Claude Code must keep this file current during the build. Do not block development on these items; scaffold adapters/mocks and continue.

## 1. Production database
Status: NOT CONNECTED

Needed before live use:
- PostgreSQL connection string
- production environment variables
- migration execution

Claude should provide the exact variable names and commands in `HANDOVER.md` once the chosen host is known.

## 2. Authentication production configuration
Status: NOT CONNECTED

May require:
- production base URL/domain
- auth secret(s)
- email provider if magic-link/reset emails are used

Demo/local authentication must work without this.

## 3. Receipt/document storage
Status: NOT CONNECTED

Choose a production object-storage provider later. Required values may include endpoint/bucket/account credentials. The app must use a storage adapter so switching provider does not affect bookkeeping logic.

## 4. Bank feed / Open Banking
Status: NOT CONNECTED

Purpose:
- import bank transactions automatically
- refresh balances
- support transaction matching

Requires choosing an authorised provider and completing its business/app onboarding and OAuth credentials.

Until connected:
- demo transactions work
- manual/CSV-style import path should exist or be easy to add
- all downstream bookkeeping workflows remain functional

## 5. Accounting ledger
Status: NOT CONNECTED

Potential targets:
- Xero
- QuickBooks
- FreeAgent

Do not hard-wire core business logic to one provider. Build an adapter interface. Live connection will require OAuth/app credentials and a mapping decision for categories/tax codes.

Initial product can remain the operational back-office layer while an established ledger remains the statutory bookkeeping source where appropriate.

## 6. Receipt OCR / document extraction
Status: NOT CONNECTED

Purpose:
- supplier/date/amount/VAT extraction from receipt photos

Claude should build a provider interface plus deterministic/demo implementation. A paid OCR/AI provider can be selected after the core workflow is proven.

## 7. AI provider
Status: NOT CONNECTED

AI is optional assistance, not a core dependency.

Use cases may include:
- ambiguous transaction categorisation suggestion
- messy document interpretation
- natural-language explanation

Requirements:
- provider adapter
- strict structured outputs/validation
- confidence/reason metadata
- never silently commit high-risk financial/compliance decisions
- deterministic rules should resolve known cases before any LLM call

No API key should be required for the V1 demo/core workflows.

## 8. Email / notifications
Status: NOT CONNECTED

Potential uses:
- invoice reminders
- missing-document reminders
- account emails
- owner/reviewer notifications

Build an interface/mock first. Choose provider later.

## 9. HMRC / statutory submission
Status: NOT CONNECTED — DO NOT FAKE

V1 should prepare/review data for VAT and CIS but must not claim submission capability.

Any future direct filing requires:
- correct HMRC-compatible integration path/software requirements
- authorised credentials/permissions
- production testing/approval as required
- explicit human submission confirmation

Until then, UI must say PREPARED / READY FOR REVIEW / NOT FILED as appropriate.

## 10. Live company configuration
Status: NOT PROVIDED

For the friend's roofing company, collect later:
- legal/trading name
- company type/company number if applicable
- business address/contact details
- VAT registration status/number/scheme if applicable
- CIS contractor/subcontractor status and settings
- financial year/accounting periods
- current customers/suppliers/subcontractors/jobs
- current outstanding invoices/bills
- preferred accounting package
- current bookkeeper/accountant workflow
- what the existing £800/month service actually includes

Do not make these up. Seed clearly labelled demo values instead.

## Owner morning goal
The final `HANDOVER.md` should reduce everything above to the shortest possible ordered checklist: create/connect account -> paste exact secret/value -> press/test exact action -> verify green status.
