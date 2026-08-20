import { expect, test, type Page } from '@playwright/test';

/**
 * These journeys run against the seeded demo business. They are the flows the
 * owner performs every week, plus the reviewer's month-end check.
 */
const OWNER = { email: 'owner@northgateroofing.example', password: 'DemoPassw0rd!' };
const REVIEWER = { email: 'accountant@northgateroofing.example', password: 'DemoPassw0rd!' };

/** Every run writes distinct records, so a re-run is never blocked by the last one. */
function unique(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
}

test.describe('signed out', () => {
  test('protected pages redirect to sign in', async ({ page }) => {
    await page.goto('/money-out');
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('wrong details are rejected without revealing whether the account exists', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(OWNER.email);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('do not match an account');

    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('do not match an account');
  });
});

test.describe('the owner', () => {
  test('sees the position of the business on the home screen', async ({ page }) => {
    await signIn(page, OWNER);
    await expect(page.getByText('In the bank')).toBeVisible();
    await expect(page.getByText('Who owes you')).toBeVisible();
    await expect(page.getByText('Bills to pay')).toBeVisible();
    // Figures are real money, not placeholders.
    await expect(page.locator('body')).toContainText(/£[\d,]+\.\d{2}/);
  });

  test('answers a question and the payment is sorted', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/ask');

    const question = page.locator('h2').first();
    await expect(question).toBeVisible();
    const questionText = (await question.textContent()) ?? '';
    expect(questionText.length).toBeGreaterThan(10);

    // One tap on the first suggested answer.
    const firstAnswer = page.locator('form button[type="submit"]').first();
    await firstAnswer.click();

    await expect(page.locator('p[role="status"]')).toBeVisible();
  });

  test('creates an invoice, sends it and records the payment', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/money-in/new');

    await page.getByLabel('Who is it for?').selectOption({ index: 1 });
    await page.getByLabel('Description').fill('Ridge tiles re-bedded, 12 metres');
    await page.getByLabel('Price each (£)').fill('850.00');
    await page.getByRole('button', { name: 'Create invoice' }).click();

    await page.waitForURL(/\/money-in\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Draft — not sent')).toBeVisible();
    // £850 + 20% VAT
    await expect(page.locator('body')).toContainText('£1,020.00');

    await page.getByRole('button', { name: 'Mark as sent' }).click();
    await expect(page.getByRole('button', { name: 'Record a payment' })).toBeVisible();

    await page.getByRole('button', { name: 'Record a payment' }).click();
    await page.getByLabel('How much came in?').fill('1020.00');
    await page.getByRole('button', { name: 'Save payment' }).click();

    await expect(page.locator('p[role="status"]')).toContainText('Payment recorded');
    await page.reload();
    await expect(page.getByText('Paid in full').first()).toBeVisible();
  });

  test('produces a printable invoice document', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/money-in?view=all');
    await page.locator('main a[href^="/money-in/"]:not([href$="/new"])').first().click();
    await page.waitForURL(/\/money-in\/[0-9a-f-]{36}$/);

    const url = page.url();
    await page.goto(`${url}/document`);
    await expect(page.locator('body')).toContainText('Invoice');
    await expect(page.locator('body')).toContainText('Northgate Roofing');
    await expect(page.locator('body')).toContainText('Total due');
  });

  test('uploads a receipt and it is matched to the payment', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/money-out/new');

    // A payment with no receipt. The reference keeps each run distinct.
    const reference = unique();
    await page.getByLabel('Amount (£)').fill('240.00');
    await page.getByLabel('What was it?').fill(`BRICKWORKS SUPPLIES ${reference}`);
    await page.getByRole('button', { name: 'Save payment' }).click();
    await page.waitForURL(/\/money-out\/[0-9a-f-]{36}$/);
    const transactionUrl = page.url();

    await page.goto('/receipts/new');
    const today = new Date().toISOString().slice(0, 10);
    const [y, m, d] = today.split('-');
    const receipt = [
      `Brickworks Supplies ${reference}`,
      `Date: ${d}/${m}/${y}`,
      'Description                              Amount',
      'Engineering bricks                       200.00',
      'Subtotal: 200.00',
      'VAT @ 20.0%: 40.00',
      'Total: 240.00',
    ].join('\n');

    await page.setInputFiles('input[type="file"][multiple]', {
      name: 'brickworks.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(receipt),
    });
    await page.getByRole('button', { name: 'Save receipt' }).click();

    await page.waitForURL(/\/receipts\/[0-9a-f-]{36}/);
    await expect(page.locator('body')).toContainText('£240.00');
    await expect(page.getByText('Filed against a payment')).toBeVisible();

    await page.goto(transactionUrl);
    await expect(page.getByText('Receipt', { exact: false }).first()).toBeVisible();
  });

  test('imports a bank statement without duplicating it', async ({ page }) => {
    await signIn(page, OWNER);
    const reference = unique();
    const csv = [
      'Date,Description,Paid in,Paid out,Balance',
      `01/07/2026,CARD PURCHASE E2E MERCHANT ${reference},,42.00,1000.00`,
      `02/07/2026,BANK CREDIT E2E CUSTOMER ${reference},120.00,,1120.00`,
    ].join('\n');

    for (const attempt of [1, 2]) {
      await page.goto('/money-out/import');
      await page.setInputFiles('#file', {
        name: 'e2e-statement.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv),
      });
      await page.getByRole('button', { name: 'Import transactions' }).click();
      const status = page.locator('p[role="status"]');
      await expect(status).toBeVisible();
      if (attempt === 1) {
        await expect(status).toContainText('Imported 2 transaction');
      } else {
        await expect(status).toContainText('already been imported');
      }
    }
  });

  test('sees job profit built from real records', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
    await page.locator('main a[href^="/jobs/"]:not([href$="/new"])').first().click();
    await expect(page.getByText('Profit so far')).toBeVisible();
    await expect(page.getByText('Materials')).toBeVisible();
    await expect(page.getByText('Total costs')).toBeVisible();
  });

  test('sees a VAT estimate that is clearly labelled as an estimate', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/vat');
    await expect(page.getByText('This is an estimate')).toBeVisible();
    await expect(page.getByText('TradeBooks does not file your VAT return')).toBeVisible();
    await expect(page.locator('body')).toContainText('Box 1');
  });

  test('sees CIS prepared but never filed', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/subcontractors');
    await expect(page.getByText('Prepared, not filed')).toBeVisible();
    await expect(page.locator('body')).toContainText('Deducted this period');
  });
});

test.describe('the bookkeeper', () => {
  test('reviews the month and finds a balanced journal', async ({ page }) => {
    await signIn(page, REVIEWER);
    await page.goto('/review');
    await expect(page.getByText('Needs attention')).toBeVisible();
    await expect(page.getByText('Balanced')).toBeVisible();

    await page.goto('/review/trial-balance');
    await expect(page.getByText('Balanced', { exact: true }).first()).toBeVisible();
    await expect(page.locator('table')).toContainText('Bank and cash');

    await page.goto('/review/close');
    await expect(page.getByRole('heading', { name: 'Period close' })).toBeVisible();

    await page.goto('/review/audit');
    await expect(page.locator('body')).toContainText('invoice.created');
  });

  test('cannot reach owner-only settings', async ({ page }) => {
    await signIn(page, REVIEWER);
    await page.goto('/settings/business');
    await expect(page.locator('body')).not.toContainText('Save business details');
  });

  test('can export every core record as CSV', async ({ page }) => {
    await signIn(page, REVIEWER);
    // Fetched from inside the page so it carries the browser's session cookie.
    await page.goto('/review/exports');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/export/transactions', { credentials: 'same-origin' });
      return { status: res.status, text: await res.text() };
    });
    expect(result.status).toBe(200);
    const text = result.text;
    expect(text).toContain('Date,Account,Description');
    expect(text).toContain('How it was categorised');
  });

  test('sees connections reported honestly', async ({ page }) => {
    await signIn(page, REVIEWER);
    await page.goto('/review/integrations');
    await expect(page.getByText('Everything below is optional')).toBeVisible();
    await expect(page.getByText('Xero', { exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).toContainText('Not connected');
  });
});

test.describe('mobile layout', () => {
  test('the bottom bar is the whole navigation on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-only check');
    await signIn(page, OWNER);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    for (const label of ['Home', 'Money in', 'Money out', 'Receipts', 'Ask me']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    // Nothing should force sideways scrolling on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('tap targets on the queue are big enough to hit', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-only check');
    await signIn(page, OWNER);
    await page.goto('/ask');
    const buttons = page.locator('form button[type="submit"]');
    const count = await buttons.count();
    if (count === 0) test.skip(true, 'no questions in the queue');
    for (let i = 0; i < Math.min(count, 5); i += 1) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
