import { describe, expect, it } from 'vitest'
import { parseBorrowFormTab } from '~/utils/borrow-form-tab'

describe('parseBorrowFormTab', () => {
  it('accepts multiply when the flag is enabled', () => {
    expect(parseBorrowFormTab('multiply', true)).toBe('multiply')
  })

  it('rejects multiply when the flag is disabled', () => {
    expect(parseBorrowFormTab('multiply', false)).toBeUndefined()
  })

  it('accepts borrow regardless of the flag', () => {
    expect(parseBorrowFormTab('borrow', true)).toBe('borrow')
    expect(parseBorrowFormTab('borrow', false)).toBe('borrow')
  })

  it('uses the first value of a repeated query param', () => {
    expect(parseBorrowFormTab(['multiply', 'borrow'], true)).toBe('multiply')
    expect(parseBorrowFormTab(['multiply', 'borrow'], false)).toBeUndefined()
  })

  it('ignores unknown or missing values', () => {
    expect(parseBorrowFormTab('repay', true)).toBeUndefined()
    expect(parseBorrowFormTab(undefined, true)).toBeUndefined()
    expect(parseBorrowFormTab(null, true)).toBeUndefined()
  })
})
