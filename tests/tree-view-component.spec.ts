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

import { ConversationTreeCanvas } from '../src/client/view/ConversationTreeCanvas.tsx'
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
    const writable = renderToStaticMarkup(createElement(ConversationTreeCanvas, {
      projection,
      onAskFollowUp,
    }))
    const readOnly = renderToStaticMarkup(createElement(ConversationTreeCanvas, {
      projection,
      onAskFollowUp,
      readOnlyReason: 'This DSH version cannot create isolated chat-only branches.',
    }))

    expect(writable).toContain('aria-label="Ask follow-up"')
    expect(readOnly).not.toContain('aria-label="Ask follow-up"')
    expect(readOnly).toContain('Tree View is read-only')
    expect(readOnly).toContain('This DSH version cannot create isolated chat-only branches.')
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
