import { getAddress } from 'viem'
import type { PortfolioPositionFilter, VaultEntity } from '@eulerxyz/euler-v2-sdk'
import { useEulerLabels } from '~/composables/useEulerLabels'
import { useVaultRegistry } from '~/composables/useVaultRegistry'
import { isVisiblePortfolioPosition } from '~/utils/portfolioVisibility'

export const buildVisiblePortfolioPositionFilter = (): PortfolioPositionFilter<VaultEntity> => {
  // When governor verification is disabled the deployment operator controls
  // both the vaults and the labels, so every position is considered visible.
  // The SDK's verifiedVaultAddresses may be empty because the vaults are not
  // registered in an on-chain Euler perspective — skipping the filter avoids
  // incorrectly hiding positions that the operator intentionally labels.
  try {
    if (useRuntimeConfig().public.configDisableGovernorVerification) {
      return () => true
    }
  }
  catch {
    // useRuntimeConfig may not be available outside Nuxt context
  }

  const { verifiedVaultAddresses, earnVaults } = useEulerLabels()
  const { escrowAddresses, getEscrowVaults } = useVaultRegistry()

  const visibleVaults = new Set<string>()
  for (const vault of verifiedVaultAddresses.value) visibleVaults.add(getAddress(vault).toLowerCase())
  for (const vault of earnVaults.value) visibleVaults.add(getAddress(vault).toLowerCase())
  for (const vault of escrowAddresses.value ?? []) visibleVaults.add(getAddress(vault).toLowerCase())
  for (const vault of getEscrowVaults()) visibleVaults.add(getAddress(vault.address).toLowerCase())

  return (position, { account }) => isVisiblePortfolioPosition(position, account, visibleVaults)
}
