# TradeBooks V1 — Handover

**Read this first.** It tells you what exists, what has been proven to work, and the short list of
things only you can do.

---

## The short version

TradeBooks V1 is built and working. It is a mobile-first bookkeeping system for a UK roofing
business that:

- imports bank statements and sorts spending using rules it learns from your answers,
- reads receipts and files them against the right payment,
- tracks what each job actually made,
- prepares VAT and CIS figures from your own records,
- asks you a short question whenever it is not certain,
- and keeps a complete audit trail of every decision.

It runs **without** Xero, QuickBooks, FreeAgent, a bank feed, an OCR service or an AI provider.
None of those are required, and nothing is lost without them.

**Your part is short.** Sections 3 and 4 below. About an hour, most of it waiting for a database to
provision.

---

## 1. What is complete

### Foundation
- Next.js 15 (App Router) + TypeScript in strict mode, PostgreSQL, Drizzle ORM with migrations.
- Multi-tenant from day one: every table is scoped to a company, and tenant identity comes from the
  server-side session only — never from anything the browser sends.
- Four roles — owner, admin, staff, bookkeeper/accountant — with permissions decided in one place.
- Built-in authentication: scrypt password hashing, server-side sessions storing only a hash of the
  token, per-IP and per-email rate limiting, and account lockout after repeated failures.
- Fail-fast environment validation: the app refuses to start with a missing or weak secret.
- `GET /api/health` reports database reachability and returns 503 when it cannot connect.

### Money and dates
- Every monetary value is an integer number of pence. Binary floating point is never used to hold
  or accumulate money. Parsing from user input and CSV files works on the decimal string.
- VAT splits are calculated so net + VAT always equals the gross exactly, at any amount.
- Dates are plain `YYYY-MM-DD` strings, so no receipt ever changes date because of a timezone.

### Records the business runs on
Customers, suppliers, subcontractors, jobs, categories, bank accounts, transactions, invoices and
lines, payments and allocations, bills and lines, receipts and documents, reconciliation state,
learned rules, exceptions, audit events, VAT periods, CIS periods and statements.

### Owner screens (mobile-first, plain English)
- **Home** — bank position, who owes you, bills to pay, month profit, VAT estimate, questions
  waiting, missing receipts, upcoming deadlines. Every figure derives from your own records.
- **Money in** — invoices with paid/part-paid/overdue state, payment recording and allocation,
  chasing status, and a printable invoice you can save as a PDF from the browser.
- **Money out** — every bank line with its category, VAT treatment, job, supplier and receipt;
  supplier bills; CSV statement import.
- **Receipts** — camera capture on a phone, original preserved untouched, automatic reading of text
  receipts, automatic matching to the payment, and a one-tap question when it is ambiguous.
- **Ask me** — the exception queue. One question at a time, one-tap answers, and a reusable rule
  created whenever the answer is safely reusable.
- **Jobs** — revenue, materials, labour, other costs, profit and margin per job, with unallocated
  costs kept visible so nothing is quietly missed.
- **Subcontractors** — CIS records, verification status, monthly deduction totals per
  subcontractor, readiness checklist, prepared-not-filed workflow.
- **VAT** — the return boxes derived from recorded data, warnings about missing evidence, a
  readiness checklist and a prepare/record-as-filed workflow.
- **Settings** — business details, VAT and CIS setup, bank accounts, categories, people and roles,
  password change.

### Bookkeeper / accountant workspace
Separate from the owner's screens: what needs attention, period position, full audit history,
automation rules with usage counts, a real trial balance, a period-close checklist, exports, and an
honest report of what is and is not connected.

### The automation model
The confidence ladder, in this fixed order:

1. **Deterministic rules** learned from your own answers.
2. **Known supplier/customer mappings and historical behaviour** — how this counterparty was
   treated before.
3. **Matching heuristics** — supplier-name matching, and amount/date matching for receipts and
   incoming payments.
4. **An optional AI provider**, only when everything above has failed.
5. **Ask Me**, whenever confidence is still insufficient.

Guarantees that hold at every step:
- Routine transactions never reach a language model. Anything a rule, history or match can place
  never leaves the server.
- Nothing is applied automatically below 80% confidence; below that it becomes a question.
- An AI suggestion is capped below the auto-apply threshold, so a person always confirms it.
- Every automated decision records its source, confidence and reason, shown on the record itself.
- With AI switched off — the default — no feature is missing.

### Internal ledger
TradeBooks keeps its own double-entry journal behind the owner-facing screens, posted automatically
from invoices, bills and bank transactions. It gives the accountant a real trial balance and makes
data integrity checkable rather than assumed. The tests assert it balances after every workflow.

### Import and export
- CSV statement import that reads whatever column names your bank uses, handles both signed-amount
  and separate paid-in/paid-out layouts, reports unreadable rows instead of failing the file, and
  is idempotent twice over (file hash and per-line fingerprint).
- CSV import for existing customers and suppliers, including UTRs and CIS status, so a business can
  bring its contacts across without retyping them. Re-importing updates rather than duplicates.
- Suspected duplicate detection: an identical statement line on the same day raises a question
  rather than being silently kept or silently dropped.
- CSV exports for transactions, invoices, bills, customers, suppliers, jobs and the journal.
- An accountant pack containing all of them.
- Mapped payloads for Xero, QuickBooks and FreeAgent that you can download today to see exactly
  what would be sent if you connected one.

### Adapters (every external boundary)
Storage, OCR, AI, email, bank feed, and three accounting packages — each behind an interface with a
working local default. Disconnecting all of them leaves TradeBooks fully functional.

---

## 2. What has been verified

All of the following pass on the current code:

| Check | What it covers | Result |
| --- | --- | --- |
| `npm run typecheck` | TypeScript, strict mode, no implicit `any`, checked index access | Passes |
| `npm run lint` | ESLint with the Next.js and TypeScript rule sets | Passes |
| `npm run test` | 119 unit and integration tests against a real PostgreSQL database | Passes |
| `npm run build` | Production build, 50 routes | Passes |
| `npm run test:e2e` | Browser journeys on a phone viewport and a desktop viewport | Passes |

What the tests actually prove:

- **Money** — parsing, rounding, VAT splits at awkward amounts, and allocation that never creates
  or loses a penny.
- **Dates** — CIS tax months (6th to 5th), VAT quarters anchored to your period end, the correct
  "one month and seven days" VAT deadline, and day counts across a British Summer Time change.
- **Tenant isolation** — a valid record id from another company is refused on read and on write;
  one company's rules never touch another's transactions.
- **Authentication** — passwords are salted and never recoverable, a malformed stored hash is
  rejected rather than crashing, session tokens are never stored raw, and roles grant exactly the
  permissions they should.
- **Invoicing** — the full draft → sent → part paid → paid lifecycle, overdue detection, refusal to
  over-allocate a payment, refusal to cancel a paid invoice, and CIS deduction on labour only.
- **CIS** — deductions on the labour element excluding VAT and materials, 30% for an unverified
  subcontractor, and per-subcontractor period totals.
- **VAT** — the return boxes derived from invoices, bills and transactions; domestic reverse charge
  landing on both sides so the net effect is nil; warnings when evidence is missing; and figures
  staying labelled as an estimate.
- **Categorisation** — rules beat history beats matching; a confirmed answer is never overwritten;
  the same question is never asked twice; answering creates a rule that sorts the next one
  automatically.
- **Receipts** — real extraction from text receipts, honest reporting when a photo cannot be read,
  automatic matching only when unambiguous, a question when two payments are equally likely,
  duplicate uploads refused, and corrections never overwritten by re-extraction.
- **Job profit** — revenue excluding VAT less costs excluding VAT, with a cost never counted twice
  when a payment settles a bill.
- **Security** — rate limiting, environment validation, upload type detection by file contents
  rather than filename, size limits, and storage keys that cannot escape the storage root.
- **The ledger** — debits equal credits after every workflow, and postings are removed when a
  document is cancelled.

End-to-end, in a real browser: signing in, being redirected when signed out, wrong credentials
rejected without revealing whether an account exists, answering a question in Ask Me, creating and
sending an invoice and recording its payment, generating the printable invoice, uploading a receipt
and watching it match, importing a statement twice without duplication, reading job profit, seeing
VAT clearly labelled as an estimate, the bookkeeper's month-end review with a balanced journal,
CSV export, and the phone layout with tap targets big enough to hit.

---

## 3. What you need to do — the short checklist

Do these in order. Nothing else is needed to go live.

### Step 1 — Create a PostgreSQL database (~10 minutes, mostly waiting)
Use any provider: Neon, Supabase, Render, Railway, AWS RDS, or your own server. Copy the connection
string it gives you. It looks like `postgres://user:password@host:5432/dbname`.

### Step 2 — Generate an authentication secret (~10 seconds)
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
Copy the output.

### Step 3 — Set four environment variables on your host
```
DATABASE_URL=<the string from step 1>
AUTH_SECRET=<the value from step 2>
APP_BASE_URL=https://<your real domain>
NODE_ENV=production
```
Everything else has a working default. Do not commit these anywhere.

### Step 4 — Deploy and set up the database
```bash
npm install
npm run build
npm run db:migrate          # once, against the production database
npm start
```
Check `https://your-domain/api/health` returns `{"status":"ok","database":"ok"}`.

### Step 5 — Make receipt storage durable (~5 minutes)
Receipts are written to disk at `./storage` by default. Either:
- mount a persistent volume there and back it up (no code change), **or**
- follow section 3 of `CONNECTIONS_REQUIRED.md` to switch to object storage.

If you deploy to a platform with an ephemeral filesystem, do this before uploading real receipts.

### Step 6 — Create the real business (~15 minutes)
1. Go to `https://your-domain/sign-up` and create your account.
2. Fill in **Settings → Business details**: name, address, VAT registration and number, how often
   you file VAT, one past VAT period end date, whether you pay subcontractors and/or have CIS
   deducted from you, your UTR, and your year end.
3. **Settings → Bank accounts**: add each account with its opening balance and the date that
   balance applies from. This is what makes the "in the bank" figure correct.
4. **Money out → Import statement**: download a CSV from your online banking and upload it.
5. Open **Ask me** and answer the questions. Each answer teaches a rule, so the queue gets shorter
   every week.

### Step 7 — Add your people
**Settings → People.** Add your bookkeeper or accountant with the *Bookkeeper / accountant* role —
they get the review workspace and exports, but cannot change your business settings. Until an email
provider is connected you set their starting password and pass it to them yourself.

---

## 4. Optional things you may want later

None of these are needed. Each is fully scaffolded, with exact steps in
`CONNECTIONS_REQUIRED.md`.

| Want | What to do | Section |
| --- | --- | --- |
| Bank transactions arriving automatically | Register with an open-banking provider | 4 |
| Photos of receipts read automatically | Connect a document-extraction provider | 6 |
| AI suggestions for the hardest items | Cloudflare Workers AI (free allowance) or Anthropic | 7 |
| Invoice reminders actually emailed | Connect an email provider | 8 |
| Sync with Xero, QuickBooks or FreeAgent | Only if the business already uses one | 5 |

**Recommendation:** run for a month with none of them. The rules learn from your answers, and you
will know exactly which of these is actually worth paying for.

---

## 5. What TradeBooks deliberately does not do

Stated plainly, because the screens say the same:

- **It does not file anything with HMRC.** It prepares VAT and CIS figures from your records and
  keeps the evidence together. You or your accountant file, then record the reference so the audit
  trail is complete. Direct submission needs HMRC recognition and is a separate regulated project.
- **It does not make payments.** It records them.
- **It is not tax advice.** It organises records and calculates summaries from them.
- **It never claims a connection it does not have.** Every optional provider reports its real state
  in the bookkeeper's Connections screen.

---

## 6. Known limitations

Honest list, in order of how likely you are to hit them.

1. **Photos of receipts are not read automatically.** The built-in reader genuinely parses text and
   emailed receipts; for a photo it asks you for the supplier and total, then finds the payment
   itself. Connecting an OCR provider (section 6) removes the asking.
2. **Emails are recorded but not sent.** Reminder history, counts and chasing status all work, but
   nothing leaves the server until an email provider is connected (section 8). This also means
   password reset by email is unavailable — an owner or admin can set a password instead.
3. **The sign-in rate limiter is in-process.** It protects a single instance. Running more than one
   instance needs a shared store; it is one function in `src/lib/rate-limit.ts`.
4. **Flat-rate VAT is recorded but not calculated.** If you are on the flat-rate scheme, the
   estimate is still worked out on the standard basis. Check with your accountant before filing.
   Standard and cash accounting are fine.
5. **The accountant pack is a plain text bundle of CSVs**, not a zip. It opens in any editor and
   each section pastes straight into a spreadsheet; individual CSVs download separately.
6. **The S3 storage adapter needs its SDK calls completing** (about 30 lines) if you choose object
   storage over a mounted volume. The interface and key handling are done.
7. **Accounting connectors map but do not push.** The mapping is real and tested — you can download
   exactly what would be sent — but the OAuth transport is not implemented, because it should not
   be written against credentials nobody has.
8. **Bank feed is CSV-only today.** Import is idempotent and every downstream workflow is identical
   whether a line arrived by CSV or a feed.
9. **There are no full-page loading skeletons.** Buttons report their own progress instead. A
   route-level Suspense boundary was tried and removed: combined with revalidation it left submit
   buttons stuck on "Saving…" after a successful write. The reasoning is recorded in
   `ARCHITECTURE.md`.
10. **Statement import is processed synchronously.** A file of a few thousand lines takes a few
   seconds. The per-row work is already isolated in one function, so moving it to a background
   queue later is a contained change rather than a rewrite.

---

## 7. If something goes wrong

- **`/api/health` returns 503** — the database is unreachable. Check `DATABASE_URL` and that the
  database allows connections from your host.
- **The app will not start with an environment error** — it is telling you exactly which variable
  is missing or too short. That check is deliberate.
- **The bookkeeper's trial balance says "out of balance"** — this should never happen. Do not rely
  on the reports; export the journal from **Bookkeeper view → Exports** and report it.
- **A figure looks wrong** — every number traces back to a record. Open the transaction, invoice or
  bill and the History section shows what changed it, when, and whether a person or a rule did it.
- **The demo business is in the way** — it is clearly labelled *Demo data*. Create your real
  business from the sign-up screen; the two are separate tenants and cannot see each other.

---

## 8. Where things live

```
HANDOVER.md                 this file
CONNECTIONS_REQUIRED.md     every external service, with exact setup steps
README.md                   how to run and verify it
PRODUCT.md                  the product specification
ARCHITECTURE.md             how it is put together and why
BUILD_PLAN.md               milestone plan, all complete

src/domain/                 the bookkeeping logic — read this first if you hire a developer
src/adapters/               every external boundary, each with a local default
src/db/schema/              the database schema
drizzle/                    generated SQL migrations
tests/                      unit and integration tests
e2e/                        browser journeys
```
