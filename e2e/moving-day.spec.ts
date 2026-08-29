import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:8787/api/demo/reset');
  await page.goto('/');
});

test('complete move cutover reaches a verified zero-gap receipt', async ({ page }) => {
  await expect(page.getByText('STRANDS AGENT · 9 TOOLS')).toBeVisible();
  await page.getByLabel('New street').fill('900 Demo Way');
  await page.getByLabel('Move date').fill('2026-09-20');
  await page.getByRole('button', { name: 'Apply move details' }).click();
  await expect(page.getByText(/900 Demo Way/)).toBeVisible();
  await page.getByRole('button', { name: 'Discover household services' }).click();
  await expect(page.locator('.service-card')).toHaveCount(11);

  await page.getByRole('button', { name: 'Build dependency-safe plan' }).click();
  await expect(page.getByRole('heading', { name: 'Which internet cutover should the agent schedule?' })).toBeVisible();
  await page.getByRole('button', { name: /Keep CableNet with two-day overlap/ }).click();

  await page.getByRole('button', { name: 'Execute approved actions' }).click();
  await page.getByRole('button', { name: 'Verify provider state' }).click();

  await expect(page.getByRole('heading', { name: 'Agent work verified' }).first()).toBeVisible();
  await expect(page.getByText('0 service gaps')).toBeVisible();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Failures' })).toContainText('0');
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('2');
  await expect(page.getByText('Household handoff ready')).toBeVisible();

  await page.getByRole('button', { name: /Update Postal Forwarding Demo/ }).click();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('1');
  await page.getByRole('button', { name: /Update Atlantic Bank Demo/ }).click();

  await expect(page.getByRole('heading', { name: 'Move complete' }).first()).toBeVisible();
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Identity tasks' })).toContainText('0');
  await expect(page.locator('.receipt-grid span').filter({ hasText: 'Confirmations' })).toContainText('14');

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Move Packet .zip' }).click();
  const download = await downloadEvent;
  const file = await download.path();
  expect(file).not.toBeNull();
  const zip = await JSZip.loadAsync(await readFile(file!));
  const files = Object.keys(zip.files);
  expect(files).toContain('move-packet.pdf');
  expect(files).toContain('appointments.ics');
  expect(files).toContain('provider-confirmations.csv');
  expect(files).toContain('household-tasks.md');
  expect(files).toContain('execution-receipt.json');
  expect(files).toContain('provider-email-drafts/electric.txt');
  const calendar = await zip.file('appointments.ics')!.async('text');
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(14);
});

test('layout remains inside the viewport', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
