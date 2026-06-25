/**
 * Labels filter for Poppie deployment.
 *
 * Filters upstream euler-labels data to include only the Poppie product
 * and its vaults. This file is the single place to edit when changing
 * which vaults/products are shown on the site.
 *
 * Only `products.json` and `entities.json` are filtered — other label
 * files (`earn-vaults.json`, `points.json`, `assets.json`) pass through
 * unchanged since they are either empty or additive.
 */

import type { LabelFile } from '~/server/api/labels/[file].get'

// ── Allowlists ──────────────────────────────────────────────────────

/** Product keys to keep from products.json (per chain). */
const ALLOWED_PRODUCTS: Record<number, Set<string>> = {
  56: new Set([
    'poppie-ondo-bsc',
  ]),
}

/** Entity keys to keep from entities.json (per chain). */
const ALLOWED_ENTITIES: Record<number, Set<string>> = {
  56: new Set([
    'poppie',
  ]),
}

// ── Filter logic ────────────────────────────────────────────────────

function filterObject<T>(
  obj: Record<string, T>,
  allowed: Set<string>,
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const key of allowed) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * Applies deployment-specific filtering to a fetched label file.
 * Returns the data unchanged if no filter is configured for the
 * given chain + file combination.
 */
export function filterLabels(
  chainId: number,
  file: LabelFile,
  data: unknown,
): unknown {
  if (file === 'products.json') {
    const allowed = ALLOWED_PRODUCTS[chainId]
    if (allowed && data && typeof data === 'object' && !Array.isArray(data)) {
      return filterObject(data as Record<string, unknown>, allowed)
    }
  }

  if (file === 'entities.json') {
    const allowed = ALLOWED_ENTITIES[chainId]
    if (allowed && data && typeof data === 'object' && !Array.isArray(data)) {
      return filterObject(data as Record<string, unknown>, allowed)
    }
  }

  return data
}
