# TradeBooks — Connections Required

This is the owner handover checklist for anything that cannot be completed without real
credentials, an external account, a business decision or production access.

**Nothing in this file blocks TradeBooks from working.** Every item below is either scaffolded
behind an adapter with a working local default, or explicitly out of scope for V1. The app runs,
seeds, tests, builds and performs every core bookkeeping workflow with none of these connected.

Status key: **REQUIRED** (needed before live use) · **OPTIONAL** (enhancement) ·
**NOT IMPLEMENTED** (deliberately out of scope for V1).

---

## Important rule

No external accounting package is required for TradeBooks core functionality.

Xero, QuickBooks and FreeAgent are OPTIONAL. If the business already uses one, connect it later.
If it uses none, TradeBooks still works in full — it owns the canonical records.

---

## 1. Production database — REQUIRED

**Status: NOT CONNECTED**

TradeBooks needs one PostgreSQL database (version 14 or later; developed against 16).

What to do:
1. Create a PostgreSQL database with any provider (Neon, Supabase, Render, RDS, or your own server).
2. Copy the connection string.
3. Set `DATABASE_URL` in the production environment.
4. Run `npm run db:migrate` once against it.
5. Optionally run `npm run db:seed` to load the demo business, or skip it and create a real account
   from the sign-up screen.

Verify: `GET /api/health` returns `{"status":"ok","database":"ok"}`.

---

## 2. Authentication secret and base URL — REQUIRED

**Status: NOT CONNECTED**

Authentication is built in — there is no third-party identity provider to sign up for.

What to do:
1. Generate a secret:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
2. Set `AUTH_SECRET` to that value (must be at least 32 characters).
3. Set `APP_BASE_URL` to the real public URL, e.g. `https://books.yourcompany.co.uk`.
4. Serve over HTTPS. Session cookies are marked `secure` automatically when `NODE_ENV=production`.

Notes:
- Passwords are hashed with scrypt (salted, per-user), using only Node's standard library.
- Sessions are stored server-side; only a SHA-256 digest of the token is kept, so a database leak
  cannot be replayed as a login.
- Sign-in is rate limited per IP and per email address, and an account locks for 15 minutes after
  10 failed attempts.
- Password reset by email needs section 8 connected. Until then, an owner or admin can set a
  starting password for a new person in **Settings → People**.

---

## 3. Receipt and document storage — REQUIRED for production

**Status: LOCAL DISK (working)**

The default writes uploaded receipts to `STORAGE_LOCAL_DIR` (`./storage`) on the server. That is
fine for a single machine, but a container that is redeployed loses the files.

What to do for production:
1. Create a bucket with any S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2, MinIO).
2. `npm install @aws-sdk/client-s3`
3. Complete the four methods in `src/adapters/storage/s3.ts` (the interface is already defined;
   only the SDK calls are missing).
4. Set `STORAGE_DRIVER=s3` plus `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY` and, for non-AWS providers, `S3_ENDPOINT`.

Alternative if staying on one server: mount a persistent volume at `STORAGE_LOCAL_DIR` and back
it up. No code change needed.

Nothing about bookkeeping logic changes either way — storage sits behind `StorageAdapter`.

---

## 4. Bank feed / open banking — OPTIONAL

**Status: NOT CONNECTED**

Until connected:
- CSV statement import works (**Money out → Import statement**), and is idempotent.
- Manual entry works.
- Categorisation, receipt matching, reconciliation, VAT, CIS and job costs all work unchanged.

To connect:
1. Register with an open-banking provider. TrueLayer is scaffolded in
   `src/adapters/bank/index.ts`; any provider fits the same interface.
2. Set `BANK_FEED_DRIVER=truelayer`, `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`,
   `TRUELAYER_REDIRECT_URI`.
3. Complete `listAccounts` and `listTransactions`, mapping the provider's response into
   `FeedTransaction`. Everything downstream already works from that shape.

Imported feed transactions use the same dedupe hash as CSV rows, so a feed and a CSV covering the
same period cannot double-count.

---

## 5. Accounting package connectors — OPTIONAL

**Status: NOT CONNECTED**

Only connect one if the business already uses it, or later chooses to.

Adapters are implemented for Xero, QuickBooks Online and FreeAgent. The **mapping is real and
unit-tested** — you can download exactly what would be sent today from
**Bookkeeper view → Exports → Mapped JSON**. Only the OAuth transport is missing.

To connect one:
1. Create a developer app with the provider and get a client ID, client secret and redirect URI.
2. Set the matching variables, e.g. `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`.
3. Implement the OAuth callback and complete `push()` in the adapter
   (`src/adapters/accounting/*.ts`).
4. External IDs are stored in the `external_mappings` table as mappings only — they never become
   the identity of a TradeBooks record.

**Do not make any accounting package the source of truth.** TradeBooks owns the canonical records.

---

## 6. Receipt reading (OCR) — OPTIONAL

**Status: BUILT-IN TEXT READER (working)**

What works today with nothing connected:
- Text and emailed receipts (`.txt`, `.csv`, plain-text merchant emails) are parsed for real —
  supplier, date, net, VAT, total and VAT number — and matched to the bank payment automatically
  when the match is unambiguous.
- Photos and scans are stored safely, and TradeBooks asks the owner for the supplier and total in
  the Ask Me queue, then finds the payment itself. Nothing is invented.

To read photos automatically:
1. Choose a document-extraction provider that accepts a multipart upload and returns JSON.
2. Set `OCR_DRIVER=http`, `OCR_HTTP_ENDPOINT`, `OCR_HTTP_API_KEY`.
3. The expected response shape is documented at the top of `src/adapters/ocr/http.ts`; adjust the
   mapping there if the provider differs.

---

## 7. AI provider — OPTIONAL, AND NEVER REQUIRED

**Status: OFF (`AI_DRIVER=none`)**

TradeBooks does not require a paid AI provider to operate, and no feature is lost with AI off.

The intelligence pipeline runs in this fixed order:
1. **Deterministic rules** — reusable rules learned from the owner's own answers.
2. **Known supplier and customer mappings, plus historical behaviour** — how this counterparty was
   categorised before.
3. **Matching heuristics** — supplier-name matching, amount and date matching for receipts and
   invoice payments.
4. **Optional AI provider** — only reached when every step above has failed.
5. **Ask Me** — whenever confidence is still insufficient.

Guarantees that hold regardless of provider:
- Routine transactions are never sent to a model. A transaction that a rule, history or a match can
  place never leaves the server.
- An AI answer is capped below the auto-apply threshold, so a person always confirms it.
- The model can only choose from the company's own categories and suppliers; invented identifiers
  are discarded.
- Every automated decision stores its source, confidence and reason, visible on the transaction and
  in the audit trail.
- If the provider is slow, erroring or unreachable, the item simply becomes an Ask Me question.

To enable it (choose one):

**Zero-cost option — Cloudflare Workers AI** (has a free daily allowance):
1. In the Cloudflare dashboard, note your Account ID.
2. Create an API token with the *Workers AI* permission.
3. Set `AI_DRIVER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
   Optionally set `CLOUDFLARE_AI_MODEL` (default `@cf/meta/llama-3.1-8b-instruct`).

**Paid option — Anthropic:**
1. Create an API key at console.anthropic.com.
2. Set `AI_DRIVER=anthropic`, `ANTHROPIC_API_KEY`, and optionally `ANTHROPIC_MODEL`.

Any other provider is a single new file implementing `AiAdapter` in `src/adapters/ai/`.

---

## 8. Email and notifications — OPTIONAL until you want to chase customers by email

**Status: OUTBOX ONLY (working, nothing sent)**

Today every reminder is written to the `outbox_messages` table with its full text, so chasing
history, reminder counts and the audit trail all work — but nothing leaves the server.

To send for real:
1. Choose a provider (Resend, Postmark, SES, or any SMTP host) and verify your sending domain.
2. `npm install nodemailer`
3. Complete `SmtpEmailAdapter.send` in `src/adapters/email/index.ts`.
4. Set `EMAIL_DRIVER=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.

Once connected, this also unlocks password-reset emails and proper invitations for new people.

---

## 9. HMRC / statutory submission — NOT IMPLEMENTED (deliberately)

**Status: NOT CONNECTED — DO NOT FAKE**

TradeBooks prepares VAT and CIS figures from your own records and keeps the evidence together. It
**does not file anything** and does not claim to. Every screen says so.

- VAT and CIS periods can be **prepared** (figures snapshotted, who prepared them recorded).
- After you or your accountant file with HMRC, record the submission reference in TradeBooks so the
  audit trail is complete.
- Direct submission would require HMRC recognition, Making Tax Digital API access and
  fraud-prevention headers. That is a separate, regulated piece of work.

---

## 10. Live company configuration — NEEDED FROM YOU

**Status: NOT PROVIDED — demo values are clearly labelled**

The seeded business (**Northgate Roofing Ltd (Demo)**) is entirely invented. Nothing in it is real.

To go live, create a fresh account from the sign-up screen and fill in **Settings → Business
details**:
- legal and trading name
- company number, if a limited company
- business address, phone and email
- VAT registration status, number, scheme and how often you file
- a past VAT period end date, so periods line up correctly
- CIS status: do you pay subcontractors, do others deduct CIS from you, and your UTR
- financial year end

Then add, in **Settings → Bank accounts**, each account with its opening balance and the date that
balance applies from. Everything else can be imported or entered as you go.

Still to collect from the business when convenient:
- current customers, suppliers and subcontractors (including UTRs and CIS verification numbers)
- outstanding invoices and bills at the start date
- open jobs and their quoted values
- whether they currently use Xero, QuickBooks, FreeAgent or none
- their current bookkeeper or accountant's workflow
- exactly what the existing £800/month service includes, so it can be compared like for like

---

## 11. Deployment platform — REQUIRED

**Status: NOT CHOSEN**

The app is a standard Next.js server application with a PostgreSQL database. It runs on any host
that can run Node 20+ — Vercel, Fly.io, Render, Railway, a VPS with Docker, or your own server.

Minimum production environment:
```
DATABASE_URL=...
AUTH_SECRET=...
APP_BASE_URL=https://...
NODE_ENV=production
```

Everything else has a working default. See `HANDOVER.md` for the exact deployment steps.

Note: the sign-in rate limiter is in-process, which protects a single instance. If you run more
than one instance, move it to a shared store — the interface is one function in
`src/lib/rate-limit.ts`.
