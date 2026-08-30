import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { jsPDF } from 'jspdf';

async function configureRoute(page: Page, destinationStreet = '900 Harbor Way') {
  await page.getByLabel('Move date').fill('2026-09-20');
  await page.getByLabel('Moving from').fill('100 Harbor Lane, Hollywood, FL');
  await page.getByLabel('Moving to').fill(`${destinationStreet}, Boca Raton, FL`);
  await page.getByRole('button', { name: 'Verify addresses & calculate route' }).click();
  const expectedMiles = destinationStreet.startsWith('1900') ? '80 mi' : '42.6 mi';
  await expect(page.locator('.route-value')).toContainText(expectedMiles);
}

async function confirmAllProviders(page: Page) {
  await expect(page.locator('.provider-checklist label')).toHaveCount(11);
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Confirm 11 selected providers' }).click();
  await expect(page.locator('.service-card')).toHaveCount(11);
}

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:8787/api/sandbox/reset');
  await page.route('**/api/sandbox/address-resolve', async (route) => {
    const { query } = route.request().postDataJSON() as { query: string };
    const destination = /900|1900/.test(query);
    const line1 = query.includes('1900') ? '1900 Harbor Way' : destination ? '900 Harbor Way' : '100 Harbor Lane';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        address: { line1, city: destination ? 'Boca Raton' : 'Hollywood', region: 'FL', postalCode: destination ? '33432' : '33020', country: 'US' },
        latitude: destination ? 26.3683 : 26.0112,
        longitude: destination ? -80.1289 : -80.1495,
        matchedAddress: `${line1.toUpperCase()}, ${destination ? 'BOCA RATON' : 'HOLLYWOOD'}, FL, ${destination ? '33432' : '33020'}`,
        source: 'us-census',
      }),
    });
  });
  await page.route('**/api/sandbox/route', async (route) => {
    const body = route.request().postDataJSON() as { destination: { address: { line1: string } } };
    const longRoute = body.destination.address.line1.startsWith('1900');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ distanceMiles: longRoute ? 80 : 42.6, durationMinutes: longRoute ? 95 : 48, source: 'census-osrm', originMatch: '100 HARBOR LN', destinationMatch: body.destination.line1 }),
    });
  });
  await page.goto('/');
});

test('complete move cutover reaches a verified zero-gap receipt', async ({ page }) => {
  await expect(page.getByText('STRANDS AGENT · 11 TOOLS')).toBeVisible();
  await configureRoute(page);
  await page.getByRole('button', { name: /Two adults \+ 3 children/ }).click();
  await page.getByRole('button', { name: 'Calculate move requirements' }).click();
  await expect(page.locator('.estimate-strip')).toContainText('62 boxes');
  const penskeOption = page.getByRole('button', { name: /PENSKE/ });
  await penskeOption.click();
  await expect(penskeOption).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /Check official live price & availability/ })).toHaveAttribute('href', 'https://www.pensketruckrental.com/quote/');
  await expect(page.getByText(/no synthetic quote is shown/)).toBeVisible();
  await expect(page.getByText('MODELED TOTAL MOVE COST')).toBeVisible();
  const initialCost = await page.locator('.cost-hero strong').textContent();
  await configureRoute(page, '1900 Harbor Way');
  await expect(page.locator('.cost-hero strong')).not.toHaveText(initialCost ?? '');
  await expect(page.locator('.route-value')).toContainText('80 mi');
  await expect(page.locator('.route-value')).toContainText('95 min');
  await page.getByRole('button', { name: /OfferUp/ }).click();
  await expect(page.getByRole('link', { name: /Search OfferUp/ })).toHaveAttribute('href', /offerup\.com\/search/);
  await page.getByRole('button', { name: /Craigslist/ }).click();
  await expect(page.getByRole('link', { name: /Search Craigslist/ })).toHaveAttribute('href', /craigslist\.org\/search\/lbs/);
  await expect(page.getByText(/1900 Harbor Way/)).toBeVisible();
  await page.getByRole('button', { name: 'Use sandbox inbox' }).click();
  await confirmAllProviders(page);

  await page.getByRole('button', { name: 'Run AI Autopilot' }).click();
  await expect(page.getByRole('heading', { name: 'Which internet cutover should the agent schedule?' })).toBeVisible();
  await page.getByRole('button', { name: /Keep CableNet with two-day overlap/ }).click();

  await expect(page.getByRole('heading', { name: 'Agent work verified' }).first()).toBeVisible();
  await expect(page.getByText('0 service gaps')).toBeVisible();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Failures' })).toContainText('0');
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('3');
  await expect(page.getByText('Household handoff ready')).toBeVisible();

  await page.getByRole('button', { name: /Update USPS Address Service/ }).click();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('2');
  await page.getByRole('button', { name: /Update Atlantic Bank/ }).click();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('1');
  await page.getByRole('button', { name: /Update Rocket Mortgage/ }).click();

  await expect(page.getByRole('heading', { name: 'Move complete' }).first()).toBeVisible();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('0');
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Confirmations' })).toContainText('14');

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download move report .pdf' }).click();
  const download = await downloadEvent;
  await download.saveAs('/tmp/moving-day-e2e-report.pdf');
  const file = await download.path();
  expect(file).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/move-report\.pdf$/);
  const pdf = await readFile(file!);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.byteLength).toBeGreaterThan(5_000);
});

test('sandbox inbox is converted into reviewed and confirmed services', async ({ page }) => {
  await configureRoute(page);
  await page.getByRole('button', { name: 'Use sandbox inbox' }).click();
  await confirmAllProviders(page);
  await expect(page.getByText('Florida Power & Light')).toBeVisible();
  await expect(page.getByText('Atlantic Bank')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open official action' }).first()).toHaveAttribute('href', 'https://www.fpl.com/account/moving/existing-customer.html');
});

test('uploaded PDF bill is parsed locally and staged for confirmation', async ({ page }) => {
  await configureRoute(page);
  const pdf = new jsPDF();
  pdf.text([
    'Provider: SunCoast Electric',
    'Service: electricity',
    'Account: 99887766',
    'Service Address: 100 HARBOR LANE, HOLLYWOOD, FL 33020',
    'Monthly Cost: 142.18',
  ], 20, 25);
  const path = '/tmp/moving-day-e2e-bill.pdf';
  await writeFile(path, Buffer.from(pdf.output('arraybuffer')));
  await page.locator('.upload-button input').setInputFiles(path);
  await expect(page.locator('.provider-checklist label')).toHaveCount(1);
  await expect(page.getByText('SunCoast Electric')).toBeVisible();
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Confirm 1 selected provider' }).click();
  await expect(page.getByText('Real account guided mode')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Build AI action plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run AI Autopilot' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Build AI action plan' }).click();
  await page.getByRole('button', { name: /Keep CableNet with two-day overlap/ }).click();
  await expect(page.getByRole('heading', { name: 'Guided action plan ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(page.getByRole('button', { name: 'Completed — undo' })).toBeVisible();
  await expect(page.getByText(/1\/1 address changes manually confirmed/)).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download current plan PDF/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/move-action-plan\.pdf$/);
  const file = await download.path();
  expect(file).not.toBeNull();
  const pdfBytes = await readFile(file!);
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
});

test('OAuth callback preserves the unsaved family and furniture draft', async ({ page }) => {
  await configureRoute(page);
  await page.getByRole('button', { name: /Two adults \+ child/ }).click();
  await page.getByLabel(/Tables/).selectOption('7');
  await expect(page.getByLabel(/Tables/)).toHaveValue('7');

  await page.goto('/?gmail=connected');
  await page.locator('.route-value').waitFor();

  await expect(page.getByLabel(/Tables/)).toHaveValue('7');
  await expect(page.getByRole('button', { name: /Two adults \+ child/ })).toHaveClass(/selected/);
});

test('reset control and each page load start a clean move session', async ({ page }) => {
  await configureRoute(page);
  await page.getByRole('button', { name: 'Use sandbox inbox' }).click();
  await confirmAllProviders(page);
  await page.getByRole('button', { name: 'Reset move' }).click();
  await expect(page.locator('.service-card')).toHaveCount(0);
  await expect(page.getByLabel('Moving from')).toHaveValue('');
  await configureRoute(page);
  await page.getByRole('button', { name: 'Use sandbox inbox' }).click();
  await confirmAllProviders(page);
  await page.reload();
  await expect(page.locator('.service-card')).toHaveCount(0);
  await expect(page.getByText('Connect an inbox')).toBeVisible();
});

test('layout remains inside the viewport', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
