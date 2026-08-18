import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const react = await import('react')
  const Icon = () => react.createElement('span', { 'aria-hidden': true })
  return {
    Button: ({ children, variant: _variant, size: _size, icon: _icon, ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & {
      children?: ReactNode
      variant?: string
      size?: string
      icon?: ReactNode
    }) => react.createElement('button', props, children),
    IconChevronUpOutline14: Icon,
    IconChevronDownOutline14: Icon,
    IconCloseOutline16: Icon,
    IconInspectOutline12: Icon,
    IconPlusOutline16: Icon,
    IconRightUpOutline16: Icon,
    IconSearchOutline16: Icon,
    IconTrashOutline16: Icon,
    MarkdownText: ({ text }: { text: string }) => react.createElement('div', null, text),
    MessageText: ({ text }: { text: string }) => react.createElement('div', null, text),
    Modal: () => null,
    StateDot: ({ state }: { state: string }) => react.createElement('span', { 'data-state': state }),
    Tooltip: ({ children }: { children: ReactNode }) => children,
  }
})

import {
  anchorRangeFromSelection,
  ConversationTreeCanvas,
  deletionConfirmationDescription,
} from '../src/client/view/ConversationTreeCanvas.tsx'
import { DEFAULT_TREE_VIEW_LABELS } from '../src/client/view/contracts.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

function count(markup: string, fragment: string): number {
  return markup.split(fragment).length - 1
}

describe('conversation tree canvas', () => {
  it('renders every projected message as a separate card in one graph', () => {
    const projection = treeProjectionFixture()
    const markup = renderToStaticMarkup(createElement(ConversationTreeCanvas, { projection }))

    expect(count(markup, 'role="treeitem"')).toBe(projection.nodes.length)
    expect(markup).toContain('Q1')
    expect(markup).toContain('A2')
    expect(markup).toContain('Q2.1')
    expect(markup).toContain('A2.1.1')
    expect(markup).toContain('Independent context')
    expect(markup).toContain('Conversation tree minimap')
  })

  it('removes every mutating follow-up action in read-only compatibility mode', () => {
    const projection = treeProjectionFixture()
    const onAskFollowUp = vi.fn(async () => {})
    const onContinueBranch = vi.fn(async () => {})
    const writable = renderToStaticMarkup(createElement(ConversationTreeCanvas, {
      projection,
      onAskFollowUp,
      onContinueBranch,
    }))
    const readOnly = renderToStaticMarkup(createElement(ConversationTreeCanvas, {
      projection,
      onAskFollowUp,
      onContinueBranch,
      readOnlyReason: 'This DSH version cannot create isolated chat-only branches.',
    }))

    expect(writable).toContain('aria-label="Ask follow-up"')
    expect(writable).toContain('aria-label="Continue this branch"')
    expect(readOnly).not.toContain('aria-label="Ask follow-up"')
    expect(readOnly).not.toContain('aria-label="Continue this branch"')
    expect(readOnly).toContain('Tree View is read-only')
    expect(readOnly).toContain('This DSH version cannot create isolated chat-only branches.')
  })

  it('distinguishes child branching from linear continuation eligibility', () => {
    const projection = treeProjectionFixture()
    const markup = renderToStaticMarkup(createElement(ConversationTreeCanvas, {
      projection,
      onAskFollowUp: vi.fn(async () => {}),
      onContinueBranch: vi.fn(async () => {}),
      onDeleteBranch: vi.fn(async () => {}),
    }))

    expect(count(markup, 'aria-label="Ask follow-up"')).toBe(6)
    expect(count(markup, 'aria-label="Continue this branch"')).toBe(3)
    expect(count(markup, 'aria-label="Delete branch"')).toBe(3)
    expect(markup).not.toContain('Open branch')
  })

  it('discloses the rc.7 archive fallback in the destructive confirmation', () => {
    const impact = { branchCount: 3, messageCount: 11 }
    const physical = deletionConfirmationDescription(DEFAULT_TREE_VIEW_LABELS, impact, 'delete')
    const archived = deletionConfirmationDescription(DEFAULT_TREE_VIEW_LABELS, impact, 'archive')

    expect(physical).toContain('3 branches')
    expect(physical).not.toContain('archived')
    expect(archived).toContain('3 branches')
    expect(archived).toContain('archived rather than physically deleted')
  })

  it('uses raw Markdown UTF-16 offsets and renders a valid branch quote', () => {
    expect(anchorRangeFromSelection('😀 markdown', 0, 2)).toEqual({
      start: 0,
      end: 2,
      text: '😀',
    })
    expect(anchorRangeFromSelection('😀 markdown', 0, 1)).toEqual({
      start: 0,
      end: 1,
      text: '\ud83d',
    })
    expect(anchorRangeFromSelection('text', 2, 2)).toBeUndefined()

    const base = treeProjectionFixture()
    const projection = {
      ...base,
      branches: base.branches.map(branch => branch.record.branchId === 'branch-1'
        ? {
            ...branch,
            record: {
              ...branch.record,
              anchorRange: { start: 0, end: 6, text: 'second' },
            },
            anchorStatus: 'range-valid' as const,
          }
        : branch),
    }
    const markup = renderToStaticMarkup(createElement(ConversationTreeCanvas, { projection }))
    expect(markup).toContain('aria-label="Quoted source"')
    expect(markup).toContain('second')
  })

  it('uses DSH theme tokens instead of fixed color literals', () => {
    const css = readFileSync(
      new URL('../src/client/view/ConversationTreeCanvas.module.css', import.meta.url),
      'utf8',
    )
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu)
    expect(css).not.toMatch(/\b(?:rgb|hsl)a?\s*\(/iu)
    expect(css).toContain('var(--dsw-')
  })
})
