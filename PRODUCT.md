# TradeBooks — Product Specification

## Product promise
“You do the roofing. Take photos of receipts and answer the odd question. TradeBooks keeps the books organised.”

TradeBooks is an AI-assisted back-office/bookkeeping system for UK trades. Roofing is the first vertical. It is not intended to replace regulated professional judgement; it automates collection, organisation, matching, categorisation, chasing and reporting, while surfacing uncertainty for review.

## Primary user
A busy roofing-company owner who is good at the trade but does not want to learn bookkeeping software. The app must feel easier than WhatsApp.

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
10. Produce clean accountant/bookkeeper-ready records.

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
- paid/unpaid/overdue state
- payment matching
- customer history
- invoice PDF/download/share capability
- simple reminders/chasing status

### Money out
- bank/card transactions
- supplier bills
- categories
- transaction-to-receipt matching
- transaction-to-job matching
- status: processed / needs receipt / needs answer / reviewed

### Receipts
- phone camera/file upload
- store original document
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
This is the central exception queue. Instead of making the owner review everything, ask only simple questions such as:
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
A more detailed area may expose categories, audit events, reconciliations, exports, integration health, rules, exceptions and period-close checks. Keep this complexity away from the trade owner.

## Supporting entities
- user
- company/tenant
- customer
- supplier
- subcontractor
- job
- quote/reference
- invoice and invoice lines
- payment
- bank/account transaction
- bill/expense
- receipt/document
- category/account mapping
- VAT treatment
- CIS record
- automation/categorisation rule
- exception/question
- audit event
- integration connection

## Automation model
Use a confidence ladder:
1. exact deterministic rule/history
2. strong matching heuristics
3. AI suggestion where useful
4. Ask Me / human review

Never hide uncertainty. Every automated decision should store source, confidence/reason and whether a human confirmed it.

## V1 demo scenarios
Seed realistic roofing data:
- Travis Perkins/material supplier purchases
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
- clear green/amber/red status semantics without relying on colour alone
- no unnecessary accounting terminology
- every screen answers “what do I need to do?”
- owner should be able to complete daily admin in a few minutes

## Out of scope for initial autonomous build
- pretending to be a chartered accountant/tax adviser
- autonomous HMRC filing without authorised integration and explicit confirmation
- autonomous bank payments
- payroll engine
- full double-entry accounting engine replacement if an established ledger integration can own that responsibility later

## Future product direction
Generalise from roofing to builders, plumbers, electricians, scaffolders, landscapers and other UK trades. Vertical-specific workflow modules may sit on the same multi-tenant core.
