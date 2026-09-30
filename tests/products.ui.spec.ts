import { test, expect } from '@playwright/test';
import { createProduct, uid } from './helpers/data';
import {
  openList,
  filterBySku,
  rowFor,
  addProductViaUi,
  openAddProductForm,
  editProductForm,
  saveEditedProduct,
  clickStockButton,
} from './helpers/ui';

/**
 * UI smoke/regression tests covering the main user flows. Each test creates its own
 * QA-auto-* data via the API and looks it up through the SKU filter.
 */

test.describe('Product list', () => {
  test('@smoke shows products with status badge and a pagination summary', async ({ page, request }) => {
    const p = await createProduct(request, { quantity: 0 });
    await openList(page);
    await expect(page.getByText(/Showing 1–10 of \d+ products/)).toBeVisible();
    await filterBySku(page, p.sku);
    const row = rowFor(page, p.sku);
    await expect(row).toContainText(p.name);
    await expect(row).toContainText('Out of Stock');
  });

  test('@smoke SKU filter narrows the list and Clear restores it', async ({ page, request }) => {
    const p = await createProduct(request);
    await openList(page);
    await filterBySku(page, p.sku);
    await expect(page.getByText('Showing 1–1 of 1 products')).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText(/Showing 1–10 of/)).toBeVisible();
  });

  test('@regression shows an empty state when nothing matches', async ({ page }) => {
    await openList(page);
    await filterBySku(page, 'ZZZ-NOPE');
    await expect(page.getByText('No products found')).toBeVisible();
    await expect(page.getByText('Showing 0–0 of 0 products')).toBeVisible();
  });

  test('@regression Next and Prev switch between pages', async ({ page, request }) => {
    // Make sure a second page exists regardless of what else is in the shared backend.
    await createProduct(request);
    const { total } = await (await request.get('/api/products?page=1&limit=10')).json();
    for (let i = total; i < 11; i++) await createProduct(request);

    await openList(page);
    const nav = page.getByRole('navigation', { name: 'Pagination' });
    const bodyRows = page.getByRole('rowgroup').nth(1).getByRole('row');
    await expect(page.getByText(/Showing 1–10 of \d+ products/)).toBeVisible();
    const firstPage = await bodyRows.allTextContents();

    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Showing 11–\d+ of \d+ products/)).toBeVisible();
    await expect(nav.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => bodyRows.first().textContent()).not.toBe(firstPage[0]);
    const secondPage = await bodyRows.allTextContents();
    expect(secondPage.filter((row) => firstPage.includes(row))).toEqual([]);

    await nav.getByRole('button', { name: 'Prev' }).click();
    await expect(page.getByText(/Showing 1–10 of \d+ products/)).toBeVisible();
    await expect(nav.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
  });

});

test.describe('Add product', () => {
  test('@smoke creates a product that survives a reload', async ({ page }) => {
    const id = uid();
    const p = { name: `QA-auto-${id}`, sku: `QA-AUTO-${id}`.toUpperCase(), price: '12.50', quantity: '3' };
    await openList(page);
    await addProductViaUi(page, p);
    await page.reload();
    await filterBySku(page, p.sku);
    const row = rowFor(page, p.sku);
    await expect(row).toContainText(p.name);
    await expect(row).toContainText('$12.50');
    await expect(row).toContainText('Low Stock');
  });

  test('@regression shows the server message when required fields are missing', async ({ page }) => {
    await openList(page);
    const form = await openAddProductForm(page);
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
  });

  test('@regression blocks a negative price in the form', async ({ page }) => {
    await openList(page);
    const form = await openAddProductForm(page);
    const price = form.getByRole('spinbutton', { name: 'Price', exact: true });
    await price.fill('-5');
    const valid = await price.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(valid).toBe(false);
  });

});

test.describe('Quantity buttons', () => {
  test('@smoke + and − change the quantity and status and persist', async ({ page, request }) => {
    const p = await createProduct(request, { quantity: 5 });
    await openList(page);
    await filterBySku(page, p.sku);
    const row = rowFor(page, p.sku);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Low Stock');
    // The buttons show "+" and "−" (U+2212); click them by their accessible names instead.
    await clickStockButton(page, row, 'Increase stock');
    await expect(row).toContainText('In Stock');
    await page.reload();
    await filterBySku(page, p.sku);
    await expect(row).toContainText('In Stock');
    await clickStockButton(page, row, 'Decrease stock');
    await expect(row).toContainText('Low Stock');
    await page.reload();
    await filterBySku(page, p.sku);
    await expect(row).toContainText('Low Stock');
  });

});

test.describe('Edit and delete', () => {
  test('@smoke Edit saves changes and they persist', async ({ page, request }) => {
    const p = await createProduct(request);
    await openList(page);
    await filterBySku(page, p.sku);
    await rowFor(page, p.sku).getByRole('button', { name: 'Edit' }).click();
    const form = editProductForm(page);
    await expect(form).toBeVisible();
    await form.getByRole('spinbutton', { name: 'Price', exact: true }).fill('7.25');
    await saveEditedProduct(page, form);
    await page.reload();
    await filterBySku(page, p.sku);
    await expect(rowFor(page, p.sku)).toContainText('$7.25');
  });

});
