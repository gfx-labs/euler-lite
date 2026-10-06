import { EulerLabelsService } from '@eulerxyz/euler-v2-sdk'
import { getAddress, type Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { getEmbeddedLabel } from '~/server/utils/embedded-labels'
import { LABEL_FILES } from '~/server/api/internal/labels/[file].get'
import { isVaultGovernorVerified, type VerificationLabels } from '~/utils/vault/governor-verification'

// Regression guard for the embedded BSC labels. The client loads these files
// through the SDK's EulerLabelsService; if any file has the wrong shape (e.g.
// points.json as {} instead of []) the whole load throws, the verified vault
// list stays empty, and with governor verification enabled every vault shows
// the unverified-vault risk prompt.

const CHAIN_ID = 56
const POPPIE_GOVERNOR = '0x1Fd3aFC21f378eE279646e6C1a59EF57896646B9'

const embeddedAdapter = {
  fetchEulerLabelsEntities: async () => getEmbeddedLabel(CHAIN_ID, 'entities.json'),
  fetchEulerLabelsProducts: async () => getEmbeddedLabel(CHAIN_ID, 'products.json'),
  fetchEulerLabelsPoints: async () => getEmbeddedLabel(CHAIN_ID, 'points.json'),
  fetchEulerLabelsEarnVaults: async () => getEmbeddedLabel(CHAIN_ID, 'earn-vaults.json'),
  fetchEulerLabelsAssets: async () => getEmbeddedLabel(CHAIN_ID, 'assets.json'),
} as unknown as ConstructorParameters<typeof EulerLabelsService>[0]

const loadLabels = () => new EulerLabelsService(embeddedAdapter).fetchEulerLabelsData(CHAIN_ID)

const productVaults = (): string[] => {
  const products = getEmbeddedLabel(CHAIN_ID, 'products.json') as Record<string, { vaults?: string[] }>
  return Object.values(products).flatMap(p => p.vaults ?? [])
}

describe('embedded BSC labels', () => {
  it('ships every label file the server serves', () => {
    for (const file of LABEL_FILES) {
      expect(getEmbeddedLabel(CHAIN_ID, file), file).toBeDefined()
    }
  })

  it('loads through the SDK labels service without throwing', async () => {
    await expect(loadLabels()).resolves.toBeDefined()
  })

  it('marks every Poppie product vault as verified', async () => {
    const data = await loadLabels()
    const verified = new Set(data.verifiedVaultAddresses.map(a => getAddress(a)))
    const vaults = productVaults()

    expect(vaults.length).toBeGreaterThan(0)
    for (const vault of vaults) {
      expect(verified.has(getAddress(vault)), vault).toBe(true)
    }
  })

  it('declares the Poppie governor so the on-chain governor check passes', async () => {
    const data = await loadLabels()
    const labels: VerificationLabels = {
      getDeclaredEntityKeys: (vaultAddress) => {
        const product = Object.values(data.products).find(p =>
          p.vaults.some(v => getAddress(v) === getAddress(vaultAddress)))
        if (!product) return undefined
        return [product.entity].flat().filter((e): e is string => typeof e === 'string')
      },
      hasEntityAddress: (entityKey, address: Address) =>
        Object.keys(data.entities[entityKey]?.addresses ?? {}).some(a => getAddress(a) === address),
    }

    for (const vault of productVaults()) {
      expect(
        isVaultGovernorVerified({ address: vault, governorAdmin: POPPIE_GOVERNOR, verified: true }, labels),
        vault,
      ).toBe(true)
    }
  })
})
