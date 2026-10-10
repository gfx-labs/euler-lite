export type BorrowFormTab = 'borrow' | 'multiply'

/**
 * Resolve the borrow pair page form tab from the `?tab=` route query.
 *
 * The enableMultiply flag hides the tab switcher, but the query still has to
 * be gated here or a direct `?tab=multiply` link would render the multiply
 * form anyway.
 */
export const parseBorrowFormTab = (value: unknown, enableMultiply: boolean): BorrowFormTab | undefined => {
  const tabValue = Array.isArray(value) ? value[0] : value
  if (tabValue === 'borrow') return 'borrow'
  if (tabValue === 'multiply' && enableMultiply) return 'multiply'
  return undefined
}
