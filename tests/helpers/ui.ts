import { Page, Locator, expect } from '@playwright/test';

type NewProduct = { name: string; sku: string; price: string; quantity: string };

export async function openList(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible();
  // "Loading…" is already in the server-rendered HTML (as is "Showing 0–0 of 0 products"),
  // so wait for it to disappear: that only happens once the client has fetched the list.
  await expect(page.getByText('Loading…')).toBeHidden();
}

export async function filterBySku(page: Page, sku: string) {
  await page.getByPlaceholder('Search by SKU').fill(sku);
  await expect(page.getByText(/Showing/)).toBeVisible();
}

export function rowFor(page: Page, sku: string): Locator {
  return page.getByRole('row').filter({ hasText: sku });
}

/**
 * Opens the Add product form and returns it. Field locators must be scoped to this form,
 * because the list filter above the table also has "Name" and "SKU" textboxes.
 */
export async function openAddProductForm(page: Page): Promise<Locator> {
  const addButton = page.getByRole('button', { name: 'Add product' });
  await expect(addButton).toBeVisible();
  await expect(addButton).toBeEnabled();
  await addButton.click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add product' }) });
  await expect(form).toBeVisible();
  return form;
}

export async function fillAddProductForm(form: Locator, p: NewProduct) {
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill(p.name);
  await form.getByRole('textbox', { name: 'SKU', exact: true }).fill(p.sku);
  await form.getByRole('spinbutton', { name: 'Price', exact: true }).fill(p.price);
  await form.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill(p.quantity);
}

/**
 * Clicks Save and verifies the product was really stored before the caller reloads the page.
 * The server returns 201 on success, but reports validation errors as HTTP 200 + {"error": ...},
 * so the body is checked too.
 */
export async function saveNewProduct(page: Page, form: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/products',
    ),
    form.getByRole('button', { name: 'Save' }).click(),
  ]);
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.error, 'saving the product must not return a validation error').toBeUndefined();
  await expect(form).toBeHidden();
}

/** The Edit product form (opened by a row's Edit button). */
export function editProductForm(page: Page): Locator {
  return page.locator('form').filter({ has: page.getByRole('heading', { name: 'Edit product' }) });
}

/** Clicks Save in the Edit form and waits until the PUT /api/products/{id} has succeeded. */
export async function saveEditedProduct(page: Page, form: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'PUT' && /^\/api\/products\/\d+$/.test(new URL(r.url()).pathname),
    ),
    form.getByRole('button', { name: 'Save' }).click(),
  ]);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.error, 'saving the product must not return a validation error').toBeUndefined();
  await expect(form).toBeHidden();
}

/** Clicks "Increase stock" / "Decrease stock" in a row and waits for POST /api/products/{id}/stock. */
export async function clickStockButton(page: Page, row: Locator, name: 'Increase stock' | 'Decrease stock') {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && /^\/api\/products\/\d+\/stock$/.test(new URL(r.url()).pathname),
    ),
    row.getByRole('button', { name }).click(),
  ]);
  expect(response.ok()).toBe(true);
}

export async function addProductViaUi(page: Page, p: NewProduct) {
  const form = await openAddProductForm(page);
  await fillAddProductForm(form, p);
  await saveNewProduct(page, form);
}
