# TradeBooks — Product Specification

## Product promise
“You do the roofing. Take photos of receipts and answer the odd question. TradeBooks keeps the books organised.”

TradeBooks is an AI-assisted back-office/bookkeeping system for UK trades. Roofing is the first vertical. It automates collection, organisation, matching, categorisation, chasing and reporting, while surfacing uncertainty for review.

## Primary user
A busy roofing-company owner who does not want to learn bookkeeping software. The app must feel easier than WhatsApp.

## Standalone-first rule
TradeBooks must work without Xero, QuickBooks, FreeAgent or any other accounting package.

TradeBooks owns its own operational bookkeeping records for:
- companies/users
- customers
- suppliers/subcontractors
- jobs
- invoices/payments
- bills/expenses
- transactions
- receipts/documents
- categories
- reconciliations
- VAT data
- CIS data
- automation rules
- exceptions
- audit history

External accounting packages are OPTIONAL adapters for sync/export/migration when a customer already uses one. Core workflows must never depend on one.

## Core outcomes
1. Know cash position now.
2. Know who owes the company money.
3. Know what bills are due.
4. Capture receipts in seconds.
5. Keep transactions categorised and reconciled.
6. See profit by job.
7. Keep subcontractor/CIS records organised.
8. See VAT position/estimate and bookkeeping readiness.
9. Reduce human bookkeeping workload by routing only exceptions to a person.
10. Produce clean accountant/bookkeeper-ready records and exports.

## Customer navigation
### Home
Show only high-value information:
- bank/cash position
- money owed by customers
- bills due
- estimated VAT position
- month-to-date income, costs and profit
- items needing an answer
- missing receipts/documents
- upcoming bookkeeping/CIS/VAT deadlines where configured

### Money in
- customer invoices
- paid/unpaid/part-paid/overdue state
- payment matching
- customer history
- invoice PDF/download/share
- simple reminders/chasing status

### Money out
- bank/card transactions
- supplier bills/expenses
- categories
- transaction-to-receipt matching
- transaction-to-job matching
- status: processed / needs receipt / needs answer / reviewed

### Receipts
- phone camera/file upload
- preserve original document
- extract supplier/date/net/VAT/gross where possible
- match to transaction
- assign category/job
- confidence and review state
- never discard the original

### Jobs
Each job should show:
- customer/address/reference/status
- quote or expected revenue
- invoices and payments
- material costs
- labour/subcontractor costs
- other costs
- gross job profit and margin
- linked receipts/transactions

### Ask Me
This is the central exception queue. Ask only simple questions such as:
- “What was this £287 payment to Smith Services?”
- “Which job was this material purchase for?”
- “Is this business or personal?”
- “We found two possible receipts. Which one matches?”

Answers should create reusable deterministic rules when safe.

### Subcontractors / CIS
Track:
- subcontractor details
- UTR/reference fields
- verification status/details where supplied by an authorised integration/user
- gross labour/payment amounts
- materials where relevant
- deductions
- net payment
- monthly period/report readiness
- audit trail and export/review workflow

Do not auto-submit statutory returns in V1 without explicit authorised integration and human confirmation.

### VAT
- VAT status/settings
- VAT on sales and purchases from recorded data
- estimated position
- missing/uncertain evidence warnings
- period readiness checklist
- export/review workflow

Do not present estimates as filed liabilities.

### Accountant/Admin view
Expose categories, audit events, reconciliations, exports, integration health, rules, exceptions and period-close checks. Keep this complexity away from the trade owner.

## Automation model
Use a confidence ladder:
1. exact deterministic rule/history
2. strong matching heuristics
3. AI suggestion where useful
4. Ask Me / human review

Never hide uncertainty. Store source, confidence/reason and human confirmation state for automated decisions.

## Import/export and migration
V1 should include practical data entry/import/export paths so a business can start without integrations:
- manual entry
- CSV import/export where useful
- accountant-ready exports
- integration-ready canonical models

Future connectors may sync with Xero, QuickBooks, FreeAgent, open-banking feeds or other systems without changing core business logic.

## V1 demo scenarios
Seed realistic roofing data:
- builders-merchant/material purchases
- fuel/vehicle expense
- scaffold supplier
- subcontractor payments
- customer invoices including overdue invoice
- several roofing jobs with different margins
- uploaded receipt matches and missing receipt examples
- Ask Me exceptions
- VAT/CIS period summaries

## UX principles
- mobile first
- large tap targets
- minimal typing
- plain English
- clear statuses without relying on colour alone
- no unnecessary accounting terminology
- every screen answers “what do I need to do?”
- owner should complete daily admin in a few minutes

## Out of scope for initial autonomous build
- pretending to be a chartered accountant/tax adviser
- autonomous HMRC filing without authorised integration and explicit confirmation
- autonomous bank payments
- payroll engine
- claiming regulatory approval that has not been obtained

## Future direction
Generalise from roofing to builders, plumbers, electricians, scaffolders, landscapers and other UK trades on the same multi-tenant core.