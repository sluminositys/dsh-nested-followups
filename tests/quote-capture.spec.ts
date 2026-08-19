import { describe, expect, it } from 'vitest'
import {
  composeQuotedQuestion,
  extractAnchoredQuestion,
  formatAnchoredQuestion,
  locateQuoteRange,
  type SavedQuote,
} from '../src/shared/anchored-question.ts'

function quote(text: string, note = ''): SavedQuote {
  return { id: `q-${text}`, text, note }
}

describe('quote capture helpers', () => {
  it('locates a quote only when it matches the source exactly once', () => {
    expect(locateQuoteRange('alpha beta gamma', 'beta')).toEqual({ start: 6, end: 10, text: 'beta' })
    expect(locateQuoteRange('beta beta', 'beta')).toBeUndefined()
    expect(locateQuoteRange('alpha', 'missing')).toBeUndefined()
    expect(locateQuoteRange('alpha', '')).toBeUndefined()
  })

  it('composes inline blocks for extra quotes and notes', () => {
    const quotes = [quote('first passage'), quote('second passage', 'why does this hold?')]

    expect(composeQuotedQuestion(quotes, 'my question', true)).toBe(
      '> second passage\n\nwhy does this hold?\n\nmy question',
    )
    expect(composeQuotedQuestion(quotes, 'my question', false)).toBe(
      '> first passage\n\n> second passage\n\nwhy does this hold?\n\nmy question',
    )
    expect(composeQuotedQuestion([], 'my question', false)).toBe('my question')
  })

  it('round-trips with the host anchor formatting for the delegated head quote', () => {
    const source = 'intro first passage outro'
    const head = locateQuoteRange(source, 'first passage')!
    const question = composeQuotedQuestion([quote('first passage')], 'my question', true)
    const durable = formatAnchoredQuestion(question, head)

    expect(durable).toBe('> first passage\n\nmy question')
    expect(extractAnchoredQuestion(durable, head)).toBe('my question')
  })
})
