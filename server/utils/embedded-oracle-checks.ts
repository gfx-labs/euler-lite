/**
 * Embedded oracle adapter check data.
 *
 * Serves oracle checks from JSON bundled in the repo instead of
 * fetching from the external euler-xyz/oracle-checks repo.
 * To update: re-fetch all.json and edit server/oracle-checks/{chainId}/all.json.
 */
import allAdapters56 from '~/server/oracle-checks/56/all.json'

const embedded: Record<string, unknown> = {
  56: allAdapters56,
}

/**
 * Returns embedded oracle adapter data for the given chain,
 * or undefined if no embedded data exists.
 */
export function getEmbeddedOracleAdapters(chainId: number): unknown | undefined {
  return embedded[String(chainId)]
}
