import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({}))
import { resolveNativeIcon } from '../src/client/primitives-compat.tsx'

describe('native icon compatibility', () => {
  it('selects the new weight-named icon when available', () => {
    const current = () => null
    const old = () => null
    expect(resolveNativeIcon({ Current: current, Legacy: old }, 'Legacy', 'Current')).toBe(current)
  })
  it('keeps the old size-named icon on legacy rc', () => {
    const old = () => null
    expect(resolveNativeIcon({ Legacy: old }, 'Legacy', 'Current')).toBe(old)
  })
  it('degrades a missing optional glyph without hiding its labelled control', () => {
    expect(resolveNativeIcon({}, 'Legacy', 'Current')).toBeTypeOf('function')
  })
})
