import { test, expect, request as pwRequest } from '@playwright/test';
import { createProduct, getProduct, uid } from './helpers/data';

/**
 * API smoke/regression tests. Every test creates its own uniquely named data (QA-auto-*),
 * because products cannot be deleted through the app and tests must not depend on each other.
 */

test.describe('Authentication', () => {
  test('@smoke rejects unauthenticated read with 401', async ({ baseURL }) => {
    // Explicitly drop credentials: contexts created via @playwright/test inherit httpCredentials from the config.
    const anon = await pwRequest.newContext({ baseURL, httpCredentials: undefined, extraHTTPHeaders: {} });
    const res = await anon.get('/api/products?page=1&limit=10');
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test('@smoke rejects unauthenticated write with 401', async ({ request, baseURL }) => {
    const p = await createProduct(request);
    // Explicitly drop credentials: contexts created via @playwright/test inherit httpCredentials from the config.
    const anon = await pwRequest.newContext({ baseURL, httpCredentials: undefined, extraHTTPHeaders: {} });
    const res = await anon.put(`/api/products/${p.id}`, {
      data: { name: 'x', sku: p.sku, price: '1', quantity: '1' },
    });
    expect(res.status()).toBe(401);
    await anon.dispose();
    expect((await getProduct(request, p.sku))?.name).toBe(p.name);
  });
});

test.describe('List, filter and pagination', () => {
  test('@smoke returns paginated items with total', async ({ request }) => {
    const res = await request.get('/api/products?page=1&limit=10');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(10);
    expect(body.total).toBeGreaterThanOrEqual(26);
  });

  test('@regression SKU filter is a case-insensitive partial match', async ({ request }) => {
    const p = await createProduct(request);
    const fragment = encodeURIComponent(p.sku.toLowerCase().slice(3, -1));
    const res = await request.get(`/api/products?page=1&limit=10&sku=${fragment}`);
    const body = await res.json();
    expect(body.items.map((item: { sku: string }) => item.sku)).toContain(p.sku);
  });

  test('@regression name filter is a case-insensitive partial match', async ({ request }) => {
    const p = await createProduct(request);
    // Names are lower case (QA-auto-<id>), so an upper-case fragment also checks case-insensitivity.
    const fragment = encodeURIComponent(p.name.toUpperCase().slice(3, -1));
    const res = await request.get(`/api/products?page=1&limit=10&name=${fragment}`);
    const body = await res.json();
    expect(body.items.map((item: { sku: string }) => item.sku)).toContain(p.sku);
  });

});

test.describe('Create product', () => {
  test('@smoke creates a product and computes its status on the server', async ({ request }) => {
    const p = await createProduct(request, { quantity: 3 });
    expect(p.id).toBeGreaterThan(0);
    expect(p.status).toBe('Low Stock');
  });

  const required: [string, Record<string, unknown>, string][] = [
    ['name', { name: '' }, 'Name is required'],
    ['sku', { sku: '' }, 'SKU is required'],
    ['price', { price: 'abc' }, 'Price must be a number'],
    ['quantity', { quantity: '' }, 'Quantity must be a non-negative integer'],
  ];
  for (const [field, patch, message] of required) {
    test(`@regression rejects invalid ${field}`, async ({ request }) => {
      const id = uid();
      const res = await request.post('/api/products', {
        data: { name: `QA-auto-${id}`, sku: `QA-AUTO-${id}`, price: 1, quantity: 1, ...patch },
      });
      const body = await res.json();
      expect(body.error).toBe(message);
      // Persisted state must be unchanged whatever status code is used.
      expect(await getProduct(request, `QA-AUTO-${id}`)).toBeUndefined();
    });
  }

  test('@regression rejects an exact duplicate SKU', async ({ request }) => {
    const p = await createProduct(request);
    const res = await request.post('/api/products', {
      data: { name: 'dup', sku: p.sku, price: 1, quantity: 1 },
    });
    expect((await res.json()).error).toBe('SKU already exists');
  });

});

test.describe('Update product', () => {
  test('@smoke updates a product and persists the change', async ({ request }) => {
    const p = await createProduct(request);
    const res = await request.put(`/api/products/${p.id}`, {
      data: { name: p.name, sku: p.sku, price: '9.50', quantity: '7' },
    });
    const body = await res.json();
    expect(body.price).toBe('9.50');
    expect(body.quantity).toBe(7);
    expect((await getProduct(request, p.sku))?.quantity).toBe(7);
  });

  test('@regression rejects a name longer than 100 characters', async ({ request }) => {
    const p = await createProduct(request);
    const res = await request.put(`/api/products/${p.id}`, {
      data: { name: 'a'.repeat(101), sku: p.sku, price: '1', quantity: '1' },
    });
    expect((await res.json()).error).toBe('Name must be at most 100 characters');
  });

});

test.describe('Stock changes', () => {
  test('@smoke applies a positive and negative delta', async ({ request }) => {
    const p = await createProduct(request, { quantity: 5 });
    let res = await request.post(`/api/products/${p.id}/stock`, { data: { delta: 1 } });
    expect((await res.json()).quantity).toBe(6);
    res = await request.post(`/api/products/${p.id}/stock`, { data: { delta: -1 } });
    const body = await res.json();
    expect(body.quantity).toBe(5);
    expect(body.status).toBe('Low Stock');
  });

  test('@regression status changes at the 5/6 boundary', async ({ request }) => {
    const p = await createProduct(request, { quantity: 5 });
    const res = await request.post(`/api/products/${p.id}/stock`, { data: { delta: 1 } });
    expect((await res.json()).status).toBe('In Stock');
  });

  test('@regression status is Out of Stock at 0', async ({ request }) => {
    const p = await createProduct(request, { quantity: 1 });
    const res = await request.post(`/api/products/${p.id}/stock`, { data: { delta: -1 } });
    expect((await res.json()).status).toBe('Out of Stock');
  });

  for (const delta of [0, 1.5, 'abc']) {
    test(`@regression rejects delta ${JSON.stringify(delta)} with 400`, async ({ request }) => {
      const p = await createProduct(request);
      const res = await request.post(`/api/products/${p.id}/stock`, { data: { delta } });
      expect(res.status()).toBe(400);
    });
  }

  test('@regression cannot go below zero (400)', async ({ request }) => {
    const p = await createProduct(request, { quantity: 1 });
    const res = await request.post(`/api/products/${p.id}/stock`, { data: { delta: -2 } });
    expect(res.status()).toBe(400);
    expect((await getProduct(request, p.sku))?.quantity).toBe(1);
  });

});
