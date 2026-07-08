<script setup lang="ts">
import type { EVault, PortfolioBorrowPosition, SecuritizeCollateralVault, TransactionPlan, VaultEntity } from '@eulerxyz/euler-v2-sdk'
import { maxUint256, type Address } from 'viem'
import type { VaultAsset } from '~/types/asset'
import { getNetAPY } from '~/utils/vault/apy'
import { withVaultIntrinsicApy } from '~/utils/vault-intrinsic-apy'
import { getAssetUsdValueOrZero, getCollateralOraclePrice, getAssetOraclePrice, conservativePriceRatioNumber } from '~/utils/sdk-prices'
import { useEulerProductOfVault } from '~/composables/useEulerLabels'
import { useModal } from '~/components/ui/composables/useModal'
import { SlippageSettingsModal, SwapTokenSelector } from '#components'
import { nanoToValue } from '~/utils/crypto-utils'
import { createRaceGuard } from '~/utils/race-guard'
import { formatNumber, formatSmartAmount, formatHealthScore } from '~/utils/string-utils'
import { formatLiquidationBuffer as formatLiqBuffer } from '~/utils/repayUtils'
import { usePriceImpactGate } from '~/composables/usePriceImpactGate'
import { isVaultRestrictedByCountry, isAssetBlockedByCountry } from '~/composables/useGeoBlock'
import { useWalletRepay } from '~/composables/repay/useWalletRepay'
import { useWalletSwapRepay } from '~/composables/repay/useWalletSwapRepay'
import { isOperationBlocked } from '~/utils/operationGuardRegistry'
import type { DisabledReasonInfo } from '~/components/entities/vault/form/types'
import { isCowProvider } from '~/entities/cowswap'

const _route = useRoute()
const _router = useRouter()
const modal = useModal()
const { isConnected } = useWagmi()
const { isSpyMode } = useSpyMode()
// Page uses SwapTokenSelector — opt into full wallet-token balance fetch while mounted.
useFullBalances()
const positionIndex = usePositionIndex()
const { planRepayFromWallet } = useEulerTx()
const { addEntry: addBatchEntry } = useTxBatch()
const { redirectAfterAdd } = useBatchRedirect()
const { isPositionsLoading, isPositionsLoaded, isDepositsLoaded, refreshAllPositions: _refreshAllPositions, getPositionBySubAccountIndex, portfolioAddress } = useEulerAccount()
const { getSupplyRewardApy, getBorrowRewardApy } = useRewardsApy()
const { settings } = useUserSettings()
const enableIntrinsicApy = computed(() => settings.value.enableIntrinsicApy)
const { eulerLensAddresses: _eulerLensAddresses } = useEulerAddresses()
const { getBalance } = useWallets()
const { runSimulation, simulationError, clearSimulationError } = useTransactionPlanSimulation()
const { slippage } = useSlippage({
  fromSymbol: () => walletSwap.selectedAsset.value?.symbol,
  toSymbol: () => borrowVault.value?.asset.symbol,
})
// --- Shared state ---
const isLoading = ref(false)
const isSubmitting = ref(false)
const isPreparing = ref(false)
const formTab = ref<'wallet'>('wallet')
const plan = ref<TransactionPlan | null>(null)
// Layer-aware: `getPositionBySubAccountIndex` reads the active batch layer's
// portfolio, so the form's debt/collateral reflect the simulated state (e.g. a
// repay added to the batch shows the reduced debt). Must be a computed, not a
// one-shot ref, or it would freeze at the layer-0 (real) snapshot.
const position = computed<PortfolioBorrowPosition<VaultEntity> | undefined>(() => {
  if (!isConnected.value && !isSpyMode.value) return undefined
  return getPositionBySubAccountIndex(+positionIndex)
})

// --- Shared computeds ---
const borrowVault = computed<EVault | undefined>(() => position.value ? position.value.borrowVault as EVault | undefined : undefined)
// Wallet balance of the debt asset from the central (layer-aware) wallet entity.
const walletBalance = computed(() => borrowVault.value?.asset.address ? getBalance(borrowVault.value.asset.address as Address) : 0n)
const collateralVault = computed<EVault | SecuritizeCollateralVault | undefined>(() => position.value ? position.value.collateralVault as EVault | SecuritizeCollateralVault | undefined : undefined)
useOperationGuard(computed(() => [borrowVault.value?.address].filter(Boolean)))
const assets = computed<VaultAsset[]>(() => [collateralVault.value?.asset, borrowVault.value?.asset].filter((asset): asset is VaultAsset => !!asset))
const assetsLabel = usePositionPairLabel(position)
const { name } = useEulerProductOfVault(borrowVault.value?.address || '')

const walletPriceInvert = usePriceInvert(
  () => collateralVault.value?.asset.symbol,
  () => borrowVault.value?.asset.symbol,
)

const oraclePriceRatio = computed(() => {
  if (!borrowVault.value || !collateralVault.value) return null
  const collateralPrice = getCollateralOraclePrice(borrowVault.value, collateralVault.value as EVault)
  const borrowPrice = getAssetOraclePrice(borrowVault.value)
  return conservativePriceRatioNumber(collateralPrice, borrowPrice)
})
walletPriceInvert.autoInvert(oraclePriceRatio)
const liquidationPrice = computed(() => {
  const healthValue = position.value?.healthFactor ?? 0n
  const health = nanoToValue(healthValue, 18)
  if (!oraclePriceRatio.value || health < 1) return null
  return oraclePriceRatio.value / health
})
const liqPriceFromHealth = (health: number | null | undefined): number | null => {
  if (!oraclePriceRatio.value || !health || health < 1 || health > 1e15) return null
  return oraclePriceRatio.value / health
}

// --- APYs ---
const collateralSupplyRewardApy = computed(() => getSupplyRewardApy(collateralVault.value?.address || ''))
const borrowRewardApy = computed(() => getBorrowRewardApy(borrowVault.value?.address || '', collateralVault.value?.address || ''))
const collateralSupplyApy = computed(() => withVaultIntrinsicApy(
  getVaultSupplyApy(collateralVault.value),
  collateralVault.value,
  enableIntrinsicApy.value,
))
const borrowApy = computed(() => withVaultIntrinsicApy(
  getVaultBorrowApy(borrowVault.value),
  borrowVault.value,
  enableIntrinsicApy.value,
))

const netApyGuard = createRaceGuard()
const netAPY = ref(0)
watchEffect(async () => {
  if (!position.value || !collateralVault.value || !borrowVault.value) {
    netAPY.value = 0
    return
  }
  const gen = netApyGuard.next()
  const [supplyUsd, borrowUsd] = await Promise.all([
    getAssetUsdValueOrZero(position.value.supplied || 0n, collateralVault.value, 'off-chain'),
    getAssetUsdValueOrZero(position.value.borrowed ?? 0n, borrowVault.value, 'off-chain'),
  ])
  if (netApyGuard.isStale(gen)) return
  netAPY.value = getNetAPY(
    supplyUsd,
    collateralSupplyApy.value,
    borrowUsd,
    borrowApy.value,
    collateralSupplyRewardApy.value || null,
    borrowRewardApy.value || null,
  )
})

// --- Tab composables ---
const wallet = useWalletRepay({
  position,
  borrowVault,
  collateralVault,
  formTab,
  walletBalance,
  plan,
  isSubmitting,
  isPreparing,
  clearSimulationError,
  runSimulation,
  netAPY,
  collateralSupplyApy,
  borrowApy,
  collateralSupplyRewardApy,
  borrowRewardApy,
  oraclePriceRatio,
})

const walletSwap = useWalletSwapRepay({
  position,
  borrowVault,
  collateralVault,
  formTab,
  plan,
  isSubmitting,
  isPreparing,
  slippage,
  clearSimulationError,
  runSimulation,
  netAPY,
  collateralSupplyApy,
  borrowApy,
  collateralSupplyRewardApy,
  borrowRewardApy,
  oraclePriceRatio,
})

// Add the current repay to the batch. CoW orders can't be merged
// into an EVC batch, so swap routes via CoW are excluded.
const canAddToBatch = computed(() => {
  if (!borrowVault.value || !position.value) return false
  if (!(+wallet.amount.value) && !(+walletSwap.amount.value)) return false
  if (walletSwap.needsSwap.value) {
    if (isWalletSwapRestricted.value || isPayWithAssetBlocked.value) return false
    return !!walletSwap.quotes.selectedQuote.value && !isCowProvider(walletSwap.quotes.selectedProvider.value)
  }
  return !!(+wallet.amount.value)
})

// A full repay closes the position: the plan's cleanup moves the remaining
// collateral shares to the owner account, so the position card the user was on
// becomes a removed ghost. Land on the owner's deposit of the collateral vault
// (where that collateral now lives) instead of the ghost.
const redirectAfterRepayAdd = (isClosing: boolean) => {
  if (isClosing && portfolioAddress.value) {
    redirectAfterAdd('/portfolio/saving', {
      subAccount: portfolioAddress.value,
      vault: collateralVault.value?.address,
    })
    return
  }
  redirectAfterAdd('/portfolio', { subAccount: position.value?.subAccount })
}

const getAffectedSubAccounts = (...accounts: Array<string | undefined | null>): Address[] | undefined => {
  const seen = new Set<string>()
  const result: Address[] = []
  for (const account of accounts) {
    if (!account) continue
    const key = account.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(account as Address)
  }
  return result.length ? result : undefined
}

const getFullRepayAffectedSubAccounts = (isClosing: boolean, ...accounts: Array<string | undefined | null>) =>
  getAffectedSubAccounts(...accounts, isClosing ? portfolioAddress.value : undefined)

const addToBatchWithoutWarnings = async () => {
  if (!canAddToBatch.value || !borrowVault.value || !position.value) return
  const borrowSymbol = borrowVault.value.asset.symbol

  if (walletSwap.needsSwap.value) {
    const quote = walletSwap.quotes.selectedQuote.value ?? undefined
    const swapAsset = walletSwap.selectedAsset.value
    const swapAmount = walletSwap.amount.value
    const swapDirection = walletSwap.direction.value
    const inSymbol = walletSwap.selectedAsset.value?.symbol ?? ''
    const isClosing = walletSwap.isFullRepay.value
    if (!swapAsset) return
    await addBatchEntry({
      label: `Repay-swap ${inSymbol} → ${borrowSymbol}`,
      buildPlan: account => walletSwap.buildRepayPlan(quote, account, {
        selectedAsset: swapAsset,
        direction: swapDirection,
        isFullRepay: isClosing,
      }),
      subAccount: position.value.subAccount as Address,
      affectedSubAccounts: getFullRepayAffectedSubAccounts(isClosing),
      nameOverride: `Repay ${borrowSymbol}`,
      review: { type: 'repay', asset: swapAsset, amount: swapAmount, swapToAsset: borrowVault.value.asset, quoteFetchedAt: walletSwap.quotes.effectiveQuoteFetchedAt.value },
    })
    walletSwap.amount.value = ''
    redirectAfterRepayAdd(isClosing)
    return
  }
  const liabilityVault = borrowVault.value.address as Address
  const amountNano = valueToNano(wallet.amount.value, borrowVault.value.asset.decimals)
  const currentDebt = position.value.borrowed || 0n
  const isFullRepay = amountNano >= currentDebt || wallet.walletRepayPercent.value >= 100
  const receiver = position.value.subAccount as Address
  await addBatchEntry({
    label: `Repay ${wallet.amount.value} ${borrowSymbol}`,
    buildPlan: account => planRepayFromWallet({
      liabilityVault,
      liabilityAmount: isFullRepay ? maxUint256 : amountNano,
      receiver,
      cleanupOnMax: isFullRepay,
      account,
    }),
    subAccount: position.value.subAccount as Address,
    affectedSubAccounts: getFullRepayAffectedSubAccounts(isFullRepay),
    review: { type: 'repay', asset: borrowVault.value.asset, amount: wallet.amount.value },
  })
  wallet.amount.value = ''
  redirectAfterRepayAdd(isFullRepay)
}

const addToBatch = async () => {
  if (!canAddToBatch.value) return
  if (walletSwap.needsSwap.value) {
    await guardWithWalletSwapPriceImpact(addToBatchWithoutWarnings)
    return
  }
  await addToBatchWithoutWarnings()
}

const { guardWithPriceImpact: guardWithWalletSwapPriceImpact } = usePriceImpactGate({
  directPriceImpact: walletSwap.swapPriceImpact,
  shouldGateUnknown: computed(() =>
    walletSwap.needsSwap.value
    && walletSwap.quotes.selectedQuote.value !== null
    && walletSwap.swapPriceImpact.value === null,
  ),
})

const isWalletSwapRestricted = computed(() =>
  walletSwap.needsSwap.value && isVaultRestrictedByCountry(
    borrowVault.value?.address || '',
    { counterpart: walletSwap.selectedAsset.value },
  ),
)

// Pay-with asset can be an arbitrary ERC-20 not tied to any vault, so the
// vault-level geo-check above can't see it. Hard-block the asset directly.
// Soft-restrict does not apply: pay-with reduces exposure to that asset.
// Pass the asset object (not just address) so symbol/name pattern rules apply.
const isPayWithAssetBlocked = computed(() =>
  walletSwap.needsSwap.value && isAssetBlockedByCountry(walletSwap.selectedAsset.value),
)

// --- Submit ---
const reviewRepayLabel = 'Review Repay'
const reviewRepayDisabled = computed(() => {
  return walletSwap.needsSwap.value
    ? (isWalletSwapRestricted.value || isPayWithAssetBlocked.value || walletSwap.isSubmitDisabled.value)
    : wallet.isSubmitDisabled.value
})

const disabledReasonInfo = computed((): DisabledReasonInfo | undefined => {
  if (walletSwap.needsSwap.value) {
    if (isPayWithAssetBlocked.value) return { message: 'Paying with this asset is not available in your region', variant: 'warning' }
    if (isWalletSwapRestricted.value) return { message: 'Swapping into this vault is not available in your region', variant: 'warning' }
    if (walletSwap.disabledReason.value) return { message: walletSwap.disabledReason.value, variant: 'error' }
    if (walletSwap.estimatesError.value) return { message: walletSwap.estimatesError.value, variant: 'error' }
  }
  else {
    if (wallet.estimatesError.value) return { message: wallet.estimatesError.value, variant: 'error' }
  }
  if (simulationError.value) return { message: simulationError.value, variant: 'error' }
  if (walletSwap.needsSwap.value && walletSwap.quotes.isLoading.value && +walletSwap.amount.value > 0) return { message: 'Fetching swap quotes...', variant: 'warning' }
  if (walletSwap.needsSwap.value && !walletSwap.quotes.selectedQuote.value && +walletSwap.amount.value > 0) return { message: 'Select a swap quote to continue', variant: 'warning' }
  return undefined
})

const activeHookWarning = computed(() => {
  return walletSwap.needsSwap.value
    ? walletSwap.hookWarning.value
    : wallet.hookWarning.value
})

const onSubmitForm = async () => {
  if (isOperationBlocked.value) return
  if (walletSwap.needsSwap.value) {
    if (isWalletSwapRestricted.value || isPayWithAssetBlocked.value) return
    await guardWithWalletSwapPriceImpact(() => walletSwap.submit())
  }
  else {
    await wallet.submit()
  }
}

const openSlippageSettings = () => {
  modal.open(SlippageSettingsModal)
}

const openWalletSwapTokenSelector = () => {
  modal.open(SwapTokenSelector, {
    props: {
      currentAssetAddress: walletSwap.selectedAsset.value?.address || borrowVault.value?.asset.address,
      onSelect: walletSwap.onSelectSwapAsset,
      allowNativeCurrency: true,
      pairedAsset: borrowVault.value?.asset,
    },
  })
}
const load = async () => {
  if (!isConnected.value && !isSpyMode.value) {
    return
  }
  isLoading.value = true
  await until(isPositionsLoaded).toBe(true)
  await until(isDepositsLoaded).toBe(true)

  try {
    // `position` is a layer-aware computed now; load() only drives the one-shot
    // form initialisation (estimates / vault selection) off the initial state.
    wallet.initEstimates()
  }
  catch (e) {
    showError('Unable to load Vault')
    console.warn(e)
  }
  finally {
    isLoading.value = false
  }
}

// --- Watchers ---
watch(isPositionsLoaded, (val) => {
  if (val) load()
}, { immediate: true })
</script>

<template>
  <div class="relative">
    <BackButton
      class="hidden tablet:inline-flex tablet:absolute tablet:top-20 tablet:right-full tablet:mr-4"
      :fallback="`/position/${positionIndex}`"
    />
    <VaultForm
      page-scroll
      back
      :back-fallback="`/position/${positionIndex}`"
      :loading="isLoading || isPositionsLoading"
      title="Repay position"
      description="Reduce your debt using tokens from your wallet."
      @submit.prevent="onSubmitForm"
    >
      <div v-if="!isConnected && !isSpyMode">
        Connect your wallet to see your positions
      </div>

      <div v-else-if="!position">
        Position not found
      </div>

      <template v-else>
        <VaultLabelsAndAssets
          :vault="borrowVault"
          :assets="assets"
          :assets-label="assetsLabel"
          size="large"
        />

        <UiAlert
          v-if="activeHookWarning"
          :title="activeHookWarning.title"
          :description="activeHookWarning.message"
          variant="error"
          size="compact"
          class="mb-16"
        />

        <div class="grid gap-16 laptop:grid-cols-[minmax(0,1fr)_360px] laptop:items-start">
          <div class="flex flex-col gap-16 w-full">
            <!-- Direct repay (no swap) -->
            <template v-if="!walletSwap.needsSwap.value">
              <AssetInput
                v-if="borrowVault?.asset"
                v-model="wallet.amount.value"
                label="Pay from wallet"
                :desc="name"
                :asset="borrowVault.asset"
                :vault="borrowVault"
                :balance="walletBalance"
                :max-handler="wallet.onSourceMax"
                maxable
              />

              <AssetInput
                v-if="borrowVault?.asset"
                v-model="wallet.amount.value"
                label="Debt to repay"
                :asset="borrowVault.asset"
                :vault="borrowVault"
                :balance="position.borrowed"
                maxable
              />

              <UiRange
                v-if="borrowVault"
                v-model="wallet.walletRepayPercent.value"
                label="Percent of debt to repay"
                :min="0"
                :max="100"
                :step="1"
                :number-filter="(n: number) => `${n}%`"
                @update:model-value="wallet.onWalletRepayPercentInput"
              />
            </template>

            <!-- Swap + repay -->
            <template v-else>
              <AssetInput
                v-if="walletSwap.selectedAsset.value"
                v-model="walletSwap.amount.value"
                label="Pay from wallet"
                :asset="walletSwap.selectedAsset.value"
                :balance="walletSwap.selectedAssetBalance.value"
                :max-handler="walletSwap.onSourceMax"
                maxable
                @update:model-value="walletSwap.onAmountInput"
              />

              <AssetInput
                v-if="borrowVault?.asset"
                v-model="walletSwap.debtAmount.value"
                label="Debt to repay"
                :asset="borrowVault.asset"
                :vault="borrowVault"
                :balance="position.borrowed"
                maxable
                @update:model-value="walletSwap.onDebtInput"
              />

              <UiRange
                v-if="borrowVault"
                v-model="walletSwap.debtPercent.value"
                label="Percent of debt to repay"
                :min="0"
                :max="100"
                :step="1"
                :number-filter="(n: number) => `${n}%`"
                @update:model-value="walletSwap.onPercentInput"
              />
            </template>

            <!-- Pay with token selector -->
            <div class="flex items-center gap-8">
              <span class="text-p3 text-content-tertiary">Pay with</span>
              <button
                type="button"
                class="flex items-center gap-6 bg-card text-p3 font-semibold px-12 h-36 rounded-[40px] whitespace-nowrap"
                @click="openWalletSwapTokenSelector"
              >
                <AssetAvatar
                  :asset="{ address: walletSwap.selectedAsset.value?.address || borrowVault?.asset.address || '', symbol: walletSwap.selectedAsset.value?.symbol || borrowVault?.asset.symbol || '' }"
                  size="20"
                />
                {{ walletSwap.selectedAsset.value?.symbol || borrowVault?.asset.symbol }}
                <SvgIcon
                  class="text-content-tertiary !w-16 !h-16"
                  name="arrow-down"
                />
              </button>
            </div>

            <!-- Swap route selector (only when swapping) -->
            <SwapRouteSelector
              v-if="walletSwap.needsSwap.value"
              :items="walletSwap.swapRouteItems.value"
              :selected-provider="walletSwap.quotes.selectedProvider.value"
              :status-label="walletSwap.quotes.statusLabel.value"
              :is-loading="walletSwap.quotes.isLoading.value"
              empty-message="Enter amount to fetch quotes"
              @select="walletSwap.quotes.selectProvider"
              @refresh="walletSwap.onRefreshSwapQuotes"
            />

            <UiAlert
              v-if="isPayWithAssetBlocked"
              title="Asset restricted"
              description="Paying with this asset is not available in your region. Pick a different asset."
              variant="warning"
              size="compact"
            />
            <UiAlert
              v-if="!isPayWithAssetBlocked && isWalletSwapRestricted"
              title="Swap restricted"
              description="Swapping into this vault is not available in your region. You can repay with the vault's underlying asset directly."
              variant="warning"
              size="compact"
            />
            <UiAlert
              v-if="walletSwap.needsSwap.value && !isWalletSwapRestricted && !isPayWithAssetBlocked && walletSwap.disabledReason.value"
              title="Error"
              variant="error"
              :description="walletSwap.disabledReason.value"
              size="compact"
            />
            <UiAlert
              v-show="walletSwap.needsSwap.value ? walletSwap.estimatesError.value : wallet.estimatesError.value"
              title="Error"
              variant="error"
              :description="walletSwap.needsSwap.value ? walletSwap.estimatesError.value : wallet.estimatesError.value"
              size="compact"
            />
            <UiAlert
              v-if="walletSwap.needsSwap.value && walletSwap.quotes.quoteError.value"
              title="Swap quote"
              variant="warning"
              :description="walletSwap.quotes.quoteError.value"
              size="compact"
            />
            <UiAlert
              v-if="simulationError"
              title="Error"
              variant="error"
              :description="simulationError"
              size="compact"
            />
          </div>

          <VaultFormInfoBlock
            v-if="collateralVault && borrowVault"
            :loading="walletSwap.needsSwap.value ? walletSwap.isEstimatesLoading.value : wallet.isEstimatesLoading.value"
            variant="card"
            class="w-full laptop:max-w-[360px]"
          >
            <SummaryRow label="Net APY">
              <SummaryValue
                :before="formatNumber(netAPY)"
                :after="formatNumber(walletSwap.needsSwap.value ? walletSwap.estimateNetAPY.value : wallet.estimateNetAPY.value)"
                suffix="%"
              />
            </SummaryRow>
            <SummaryRow label="Oracle price">
              <SummaryPriceValue
                :value="oraclePriceRatio != null ? formatSmartAmount(walletPriceInvert.invertValue(oraclePriceRatio)!) : undefined"
                :symbol="walletPriceInvert.displaySymbol"
                invertible
                @invert="walletPriceInvert.toggle"
              />
            </SummaryRow>
            <SummaryRow label="Liq. price">
              <SummaryPriceValue
                :before="walletPriceInvert.invertValue(liquidationPrice) != null ? formatSmartAmount(walletPriceInvert.invertValue(liquidationPrice)!) : undefined"
                :after="walletPriceInvert.invertValue(liqPriceFromHealth(nanoToValue((walletSwap.needsSwap.value ? walletSwap.estimateHealth.value : wallet.estimateHealth.value) ?? 0n, 18))) != null
                  ? formatSmartAmount(walletPriceInvert.invertValue(liqPriceFromHealth(nanoToValue((walletSwap.needsSwap.value ? walletSwap.estimateHealth.value : wallet.estimateHealth.value) ?? 0n, 18)))!)
                  : undefined"
                :symbol="walletPriceInvert.displaySymbol"
                invertible
                @invert="walletPriceInvert.toggle"
              />
            </SummaryRow>
            <SummaryRow label="Liq. buffer">
              <SummaryValue
                :before="formatLiqBuffer(walletPriceInvert.invertValue(oraclePriceRatio), walletPriceInvert.invertValue(liquidationPrice))"
                :after="formatLiqBuffer(
                  walletPriceInvert.invertValue(oraclePriceRatio),
                  walletPriceInvert.invertValue(liqPriceFromHealth(nanoToValue((walletSwap.needsSwap.value ? walletSwap.estimateHealth.value : wallet.estimateHealth.value) ?? 0n, 18))),
                )"
                suffix="%"
              />
            </SummaryRow>
            <SummaryRow label="LTV">
              <SummaryValue
                :before="formatNumber(ltvToPercent(nanoToValue(position.userLTV ?? position.currentLTV ?? 0n, 18)))"
                :after="formatNumber(nanoToValue((walletSwap.needsSwap.value ? walletSwap.estimateUserLTV.value : wallet.estimateUserLTV.value) ?? 0n, 18))"
                suffix="%"
              />
            </SummaryRow>
            <SummaryRow label="Health score">
              <SummaryValue
                :before="formatHealthScore(nanoToValue(position.healthFactor ?? 0n, 18))"
                :after="formatHealthScore(nanoToValue((walletSwap.needsSwap.value ? walletSwap.estimateHealth.value : wallet.estimateHealth.value) ?? 0n, 18))"
              />
            </SummaryRow>
            <SwapDetailsSummary
              v-if="walletSwap.needsSwap.value && (walletSwap.swapEstimatedOutput.value || walletSwap.quotes.quoteError.value)"
              :input-display="walletSwap.swapInputDisplay.value"
              :input-exact-display="walletSwap.swapInputExactDisplay.value"
              :output-display="walletSwap.swapOutputDisplay.value"
              :output-exact-display="walletSwap.swapOutputExactDisplay.value"
              :price-impact="walletSwap.swapPriceImpact.value"
              :slippage="slippage"
              :routed-via="walletSwap.swapRoutedVia.value"
              @open-slippage-settings="openSlippageSettings"
            />
          </VaultFormInfoBlock>

          <FormSubmitFooter
            :info-pair="position"
            :info-disabled="isLoading || isSubmitting"
            :submit-disabled="reviewRepayDisabled"
            :submit-loading="isSubmitting || isPreparing"
            :disabled-reason="disabledReasonInfo?.message"
            :disabled-reason-variant="disabledReasonInfo?.variant"
            :can-add-to-batch="canAddToBatch"
            @add-to-batch="addToBatch"
          >
            {{ reviewRepayLabel }}
          </FormSubmitFooter>
        </div>
      </template>
    </VaultForm>
  </div>
</template>
