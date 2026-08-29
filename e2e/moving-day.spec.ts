import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:8787/api/demo/reset');
  await page.goto('/');
});

test('complete move cutover reaches a verified zero-gap receipt', async ({ page }) => {
  await expect(page.getByText('STRANDS AGENT · 6 TOOLS')).toBeVisible();
  await page.getByRole('button', { name: 'Discover household services' }).click();
  await expect(page.locator('.service-card')).toHaveCount(11);

  await page.getByRole('button', { name: 'Build dependency-safe plan' }).click();
  await expect(page.getByRole('heading', { name: 'Which internet cutover should the agent schedule?' })).toBeVisible();
  await page.getByRole('button', { name: /Keep CableNet with two-day overlap/ }).click();

  await page.getByRole('button', { name: 'Execute approved actions' }).click();
  await page.getByRole('button', { name: 'Verify provider state' }).click();

  await expect(page.getByRole('heading', { name: 'Cutover verified' })).toBeVisible();
  await expect(page.getByText('0 service gaps')).toBeVisible();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Failures' })).toContainText('0');
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('2');
  await expect(page.getByText('Move complete')).toBeVisible();
});

test('layout remains inside the viewport', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
