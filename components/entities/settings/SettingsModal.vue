<script setup lang="ts">
const { isDark, toggleTheme } = useTheme()
const { settings, updateSetting } = useUserSettings()

const advancedFeatures = [
  'Batch transactions: queue multiple actions into one atomic transaction',
  'Migrate Euler positions out to Aave v3 and Morpho',
]

const emit = defineEmits(['close'])

const openSupport = () => {
  emit('close')
  setTimeout(() => {
    window.MavaWebChatToggle?.()
  }, 300)
}
</script>

<template>
  <BaseModalWrapper
    title="Settings"
    @close="$emit('close')"
  >
    <div class="mb-20 rounded-16 border border-line-default bg-card p-16">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-p2">
            Theme
          </div>
          <div class="text-p3 text-content-muted">
            Dark mode by default
          </div>
        </div>
        <UiSwitch
          :model-value="isDark"
          @update:model-value="toggleTheme"
        />
      </div>
    </div>
    <div class="mb-20 rounded-16 border border-line-default bg-card p-16">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-p2">
            Intrinsic APY
          </div>
          <div class="text-p3 text-content-muted">
            Include intrinsic APY in displayed rates
          </div>
        </div>
        <UiSwitch
          :model-value="settings.enableIntrinsicApy"
          @update:model-value="updateSetting('enableIntrinsicApy', $event ?? false)"
        />
      </div>
    </div>
    <!-- Rewards toggle hidden — no reward campaigns in this deployment -->
    <div class="mb-20 rounded-16 border border-line-default bg-card p-16">
      <div class="flex items-start justify-between gap-16">
        <div class="min-w-0">
          <div class="text-p2">
            Enable advanced mode
          </div>
          <ul class="mt-6 list-disc pl-16 text-p3 text-content-muted">
            <li
              v-for="feature in advancedFeatures"
              :key="feature"
            >
              {{ feature }}
            </li>
          </ul>
        </div>
        <UiSwitch
          class="shrink-0"
          :model-value="settings.enableAdvancedMode"
          @update:model-value="updateSetting('enableAdvancedMode', $event ?? false)"
        />
      </div>
    </div>
    <Permit2Settings />
    <!-- SlippageSettings hidden: swap features are disabled in this deployment -->
    <button
      class="mt-20 w-full rounded-16 border border-line-default bg-card p-16 text-left hover:bg-card-hover transition-colors cursor-pointer"
      @click="openSupport"
    >
      <div class="flex items-center justify-between">
        <div>
          <div class="text-p2 text-content-primary">
            Support
          </div>
          <div class="text-p3 text-content-muted">
            Need help? Chat with our support team.
          </div>
        </div>
        <SvgIcon
          name="arrow-top-right"
          class="!w-16 !h-16 text-content-muted"
        />
      </div>
    </button>
  </BaseModalWrapper>
</template>
