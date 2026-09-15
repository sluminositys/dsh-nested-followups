import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { en, labelsFrom, NS, zh } from '../src/client/locales.ts'
import type {
  ContextBoundaryIneligibilityReason,
  ContextExclusionReason,
} from '../src/client/tree/context-preview.ts'
import { DEFAULT_TREE_VIEW_LABELS, type ContextPreviewLabels } from '../src/client/view/contracts.ts'

function translator(dictionary: Readonly<Record<string, string>>): TranslateNS<typeof NS> {
  return (key, params) => {
    const template = dictionary[key]
    if (template === undefined) throw new Error(`Missing translation: ${key}`)
    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = params?.[name]
      if (value === undefined) throw new Error(`Missing parameter ${name} for ${key}`)
      return String(value)
    })
  }
}

function snapshot(labels: ContextPreviewLabels) {
  return {
    ...labels,
    summary: labels.summary(4, 10),
    boundaryThrough: labels.boundaryThrough('A2.1 #3'),
    revealMessage: labels.revealMessage('A2.1 #3'),
  }
}

describe('Context Preview label contracts', () => {
  it('keeps dictionary keys and named parameters synchronized across languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    const chinese = new Map(Object.entries(zh))
    const parameters = (text: string) => [...text.matchAll(/\{(\w+)\}/g)]
      .map(match => match[1]).sort()
    for (const [key, english] of Object.entries(en)) {
      const translated = chinese.get(key)
      if (translated === undefined) throw new Error(`Missing Chinese translation: ${key}`)
      expect(english.trim(), key).not.toBe('')
      expect(translated.trim(), key).not.toBe('')
      expect(parameters(translated), key).toEqual(parameters(english))
    }
  })

  it('maps every model reason to its own namespace key', () => {
    const labels = labelsFrom(key => key).contextPreview
    expectTypeOf<ContextPreviewLabels['unavailableReasons']>()
      .toEqualTypeOf<Readonly<Record<ContextBoundaryIneligibilityReason, string>>>()
    expectTypeOf<ContextPreviewLabels['exclusionReasons']>()
      .toEqualTypeOf<Readonly<Record<ContextExclusionReason, string>>>()
    expect(snapshot(labels)).toEqual({
      title: 'context.title',
      tab: 'context.tab',
      description: 'context.description',
      inherited: 'context.inherited',
      excluded: 'context.excluded',
      summary: 'context.summary',
      noExclusions: 'context.noExclusions',
      boundaryThrough: 'context.boundaryThrough',
      showDetails: 'context.showDetails',
      revealMessage: 'context.revealMessage',
      unavailableReasons: {
        'user-message': 'context.unavailable.userMessage',
        'turn-open': 'context.unavailable.turnOpen',
        'turn-tail-unavailable': 'context.unavailable.turnTailUnavailable',
      },
      exclusionReasons: {
        'root-session-tail': 'context.excluded.rootSessionTail',
        'current-branch-tail': 'context.excluded.currentBranchTail',
        'sibling-branch': 'context.excluded.siblingBranch',
        'descendant-branch': 'context.excluded.descendantBranch',
      },
    })
  })

  it('keeps the standalone English fallback synchronized with localized labels', () => {
    expect(snapshot(DEFAULT_TREE_VIEW_LABELS.contextPreview))
      .toEqual(snapshot(labelsFrom(translator(en)).contextPreview))
  })

  it('passes counts and message labels unchanged to the host translator', () => {
    const t = vi.fn<TranslateNS<typeof NS>>((key) => key)
    const labels = labelsFrom(t).contextPreview
    t.mockClear()
    labels.summary(0, 2_000)
    labels.boundaryThrough('A2.1 #3')
    labels.revealMessage('A2.1.1.1.1')
    expect(t.mock.calls).toEqual([
      ['context.summary', { inherited: 0, excluded: 2_000 }],
      ['context.boundaryThrough', { label: 'A2.1 #3' }],
      ['context.revealMessage', { label: 'A2.1.1.1.1' }],
    ])
  })

  it.each([
    { dictionary: en, name: 'English', summary: 'Inherited messages: 1; excluded messages: 0.' },
    { dictionary: zh, name: 'Chinese', summary: '继承的消息：1 条；不带入的消息：0 条。' },
  ])('resolves all $name strings, including zero and single-message totals', ({ dictionary, summary }) => {
    const labels = labelsFrom(translator(dictionary)).contextPreview
    expect(labels.summary(1, 0)).toBe(summary)
    expect(labels.summary(2_000, 1)).toContain('2000')
    expect(labels.boundaryThrough('A2.1 #3')).toContain('A2.1 #3')
    expect(labels.revealMessage('A2.1.1.1.1')).toContain('A2.1.1.1.1')
    const resolved = JSON.stringify(snapshot(labels))
    expect(resolved).not.toMatch(/context\.(?:title|unavailable|excluded)|\{(?:inherited|excluded|label)\}/)
    expect(new Set(Object.values(labels.unavailableReasons)).size).toBe(3)
    expect(new Set(Object.values(labels.exclusionReasons)).size).toBe(4)
  })
})
