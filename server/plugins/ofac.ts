import { startOfacRefresh } from '~/server/utils/ofac'

export default defineNitroPlugin(() => {
  startOfacRefresh()
})
