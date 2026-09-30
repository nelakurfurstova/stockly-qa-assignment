import { APIRequestContext, expect } from '@playwright/test';

/** Unique suffix so every run creates its own data (products cannot be deleted, see BUG-01). */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: string;
  quantity: number;
  status: string;
}

export async function createProduct(
  request: APIRequestContext,
  overrides: Partial<{ name: string; sku: string; price: number | string; quantity: number | string }> = {},
): Promise<Product> {
  const id = uid();
  const res = await request.post('/api/products', {
    data: { name: `QA-auto-${id}`, sku: `QA-AUTO-${id}`.toUpperCase(), price: 1, quantity: 3, ...overrides },
  });
  const body = await res.json();
  expect(body.error, 'product creation must not return a validation error').toBeUndefined();
  return body as Product;
}

export async function getProduct(request: APIRequestContext, sku: string): Promise<Product | undefined> {
  const res = await request.get(`/api/products?page=1&limit=100&sku=${encodeURIComponent(sku)}`);
  const body = await res.json();
  return (body.items as Product[]).find((p) => p.sku === sku);
}
