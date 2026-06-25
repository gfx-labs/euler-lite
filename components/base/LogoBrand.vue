<script setup lang="ts">
const { logoUrl } = useDeployConfig()

const hasCustomLogo = computed(() => !!logoUrl)
const customLogoFailed = ref(false)

const onImageError = () => {
  customLogoFailed.value = true
}
</script>

<template>
  <img
    v-if="hasCustomLogo && !customLogoFailed"
    class="w-24 h-24 logo-brand-img"
    :src="logoUrl"
    alt="Logo"
    @error="onImageError"
  >
  <!-- Default Euler logo — uses currentColor so it follows the theme -->
  <svg
    v-else
    class="w-24 h-24"
    viewBox="0 0 462 460"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Euler"
  >
    <path
      d="M403.944 241.649L149.691 388.442C132.132 398.579 126.113 421.026 136.248 438.579C146.381 456.132 168.831 462.142 186.389 452.005L440.642 305.212C458.2 295.075 464.22 272.628 454.085 255.075C443.952 237.523 421.502 231.512 403.944 241.649Z"
      fill="currentColor"
    />
    <path
      d="M228.091 194.721L37.402 304.815C19.8435 314.952 13.8244 337.399 23.9583 354.952C34.0923 372.505 56.5418 378.516 74.1004 368.378L264.79 258.283C282.348 248.146 288.367 225.699 278.233 208.146C268.099 190.594 245.65 184.583 228.091 194.721Z"
      fill="currentColor"
    />
    <path
      d="M275.25 18.7317L20.9976 165.525C3.43901 175.662 -2.57981 198.109 7.55407 215.662C17.688 233.214 40.1372 239.225 57.6959 229.088L311.949 82.2946C329.507 72.1575 335.526 49.7101 325.392 32.1578C315.258 14.6053 292.809 8.59428 275.25 18.7317Z"
      fill="currentColor"
    />
  </svg>
</template>

<style>
/* White logo: invert in light mode so it's dark/visible.
   In dark mode, keep it white (no filter needed). */
:root:not([data-theme="dark"]) .logo-brand-img {
  filter: invert(1);
}
</style>
