<script setup lang="ts">
// Root "/" is served by server/middleware/landing.ts (landing page).
// If the SPA client-side router reaches here (e.g., via navigateTo('/')),
// redirect to /lend instead of showing a blank page.
const route = useRoute()
navigateTo(
  { name: 'lend', query: route.query, hash: route.hash },
  { replace: true },
)
</script>

<template>
  <div />
</template>
