/**
 * Embedded label files for the Poppie deployment.
 *
 * Serves labels from JSON bundled in the repo instead of fetching
 * from an external GitHub labels repo. Removes the external
 * dependency and eliminates fetch timeouts / rate limits.
 *
 * To update: edit the JSON files in server/labels/{chainId}/.
 */
import type { LabelFile } from '~/server/api/internal/labels/[file].get'

// Import JSON files statically so Nitro bundles them
import products56 from '~/server/labels/56/products.json'
import entities56 from '~/server/labels/56/entities.json'
import earnVaults56 from '~/server/labels/56/earn-vaults.json'
import points56 from '~/server/labels/56/points.json'
import assets56 from '~/server/labels/56/assets.json'

type LabelScope = number | 'all'

const embedded: Record<string, Record<string, unknown>> = {
  56: {
    'products.json': products56,
    'entities.json': entities56,
    'earn-vaults.json': earnVaults56,
    'points.json': points56,
    'assets.json': assets56,
  },
}

/**
 * Returns embedded label data for the given scope and file,
 * or undefined if no embedded file exists (caller should fall
 * back to upstream fetch).
 */
export function getEmbeddedLabel(scope: LabelScope, file: LabelFile): unknown | undefined {
  return embedded[String(scope)]?.[file]
}
