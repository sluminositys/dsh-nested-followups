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
import { saveTreeViewState, type TreeViewStateStorage } from '../src/client/view/state.ts'
import type { TreeViewState } from '../src/shared/types.ts'
import type { ConversationTreeProjection } from '../src/shared/projection.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

function count(markup: string, fragment: string): number {
  return markup.split(fragment).length - 1
}

function renderWithViewState(
  viewState: TreeViewState,
  projection = treeProjectionFixture(),
): string {
  const values = new Map<string, string>()
  const storage: TreeViewStateStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
  saveTreeViewState(viewState, storage)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  try {
    return renderToStaticMarkup(createElement(ConversationTreeCanvas, { projection }))
  } finally {
    if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage
    else Object.defineProperty(globalThis, 'localStorage', previous)
  }
}

function viewState(
  collapsedBranchIds: readonly string[],
  anchorDotIds: readonly string[],
): TreeViewState {
  return {
    treeId: 'tree-layout',
    viewport: { x: 0, y: 0, zoom: 1 },
    collapsedBranchIds: [...collapsedBranchIds],
    anchorDotIds: [...anchorDotIds],
    expandedNodeIds: [],
  }
}

function collapseV2ProjectionFixture(): ConversationTreeProjection {
  const base = treeProjectionFixture()
  const templateBranch = base.branches.find(branch => branch.record.branchId === 'branch-2')!
  const templateQuestion = base.nodes.find(node => node.nodeId === 'branch-2-q')!
  const templateAnswer = base.nodes.find(node => node.nodeId === 'branch-2-a')!
  const question = {
    ...templateQuestion,
    nodeId: 'branch-3-q',
    branchId: 'branch-3',
    sessionId: 'branch-session-3',
    messageId: 'branch-3-q',
    turnId: 'branch-session-3:1',
    branchPath: [2, 3],
    seq: 12,
    time: 13,
    text: 'third sibling question',
    summary: 'third sibling question',
  }
  const answer = {
    ...templateAnswer,
    nodeId: 'branch-3-a',
    branchId: 'branch-3',
    sessionId: 'branch-session-3',
    messageId: 'branch-3-a',
    turnId: 'branch-session-3:1',
    branchPath: [2, 3],
    seq: 13,
    time: 14,
    text: 'third sibling answer',
    summary: 'third sibling answer',
    branchTargetMessageId: 'branch-3-a',
    branchTargetSeq: 13,
  }
  const branch = {
    ...templateBranch,
    record: {
      ...templateBranch.record,
      branchId: 'branch-3',
      clientRequestId: 'request-branch-3',
      sessionId: 'branch-session-3',
      siblingOrdinal: 3,
      createdAt: 13,
    },
    branchPath: [2, 3],
    nodeIds: ['branch-3-q', 'branch-3-a'],
  }
  return {
    ...base,
    nodes: [...base.nodes, question, answer],
    branches: [...base.branches, branch],
    edges: [
      ...base.edges,
      {
        edgeId: 'sequence:branch-3-q:branch-3-a',
        sourceNodeId: 'branch-3-q',
        targetNodeId: 'branch-3-a',
        kind: 'sequence',
      },
      {
        edgeId: 'branch:root-a2:branch-3-q',
        sourceNodeId: 'root-a2',
        targetNodeId: 'branch-3-q',
        kind: 'branch',
      },
    ],
  }
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

  it('disables branching and removes continuation in read-only compatibility mode', () => {
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
      readOnlyReason: 'This DSH version cannot create isolated read-only branches.',
    }))

    expect(writable).toContain('aria-label="Ask follow-up"')
    expect(writable).toContain('aria-label="Continue this branch"')
    expect(readOnly).toContain('aria-label="Ask follow-up"')
    expect(readOnly).toContain('aria-disabled="true"')
    expect(readOnly).not.toContain('aria-label="Continue this branch"')
    expect(readOnly).toContain('Tree View is read-only')
    expect(readOnly).toContain('This DSH version cannot create isolated read-only branches.')
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

  it('keeps finalized failed turns branchable while disabling an open turn with a reason', () => {
    const base = treeProjectionFixture()
    const projection = {
      ...base,
      nodes: base.nodes.map(node => {
        if (node.nodeId === 'root-a1') return { ...node, state: 'error' as const }
        if (node.nodeId !== 'root-a3') return node
        const {
          branchTargetMessageId: _branchTargetMessageId,
          branchTargetSeq: _branchTargetSeq,
          ...openNode
        } = node
        return { ...openNode, state: 'streaming' as const }
      }),
    }
    const markup = renderToStaticMarkup(createElement(ConversationTreeCanvas, {
      projection,
      onAskFollowUp: vi.fn(async () => {}),
    }))

    expect(count(markup, 'aria-label="Ask follow-up"')).toBe(6)
    expect(count(markup, 'aria-disabled="true"')).toBe(1)
    expect(markup).toContain(DEFAULT_TREE_VIEW_LABELS.askWaitForCompletion)
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

  it('renders a level-zero group as one focusable dot with no delete entry', () => {
    const markup = renderWithViewState(
      viewState([], ['root-a2']),
      collapseV2ProjectionFixture(),
    )

    expect(count(markup, 'role="treeitem"')).toBe(6)
    expect(markup).toContain('data-open="false"')
    expect(markup).toContain('Expand 3 branches · +8 messages')
    expect(markup).not.toContain('aria-label="Delete branch"')
  })

  it('renders all three level-one capsules with the full anatomy from AC-10', () => {
    const markup = renderWithViewState(
      viewState(['branch-1', 'branch-2', 'branch-3'], []),
      collapseV2ProjectionFixture(),
    )

    expect(count(markup, 'data-mode="capsule"')).toBe(3)
    expect(markup).toContain('Expand branch 2.1')
    expect(markup).toContain('Expand branch 2.2')
    expect(markup).toContain('Expand branch 2.3')
    expect(markup).toContain('branch question')
    expect(markup).toContain('⑂×1')
    expect(markup).toContain('+4')
  })

  it('renders a partial level-one capsule beside an expanded sibling branch', () => {
    const markup = renderWithViewState(viewState(['branch-1'], []))

    expect(count(markup, 'role="treeitem"')).toBe(8)
    expect(markup).toContain('data-mode="capsule"')
    expect(markup).toContain('Expand branch 2.1')
    expect(markup).toContain('branch question')
    expect(markup).toContain('⑂×1')
    expect(markup).toContain('+4')
    expect(markup).toContain('aria-label="Collapse branch 2.2"')
  })

  it('keeps a newly revealed nested anchor at the compact 20px level', () => {
    const markup = renderWithViewState(
      viewState(['branch-2', 'branch-3'], ['branch-1-a']),
      collapseV2ProjectionFixture(),
    )

    expect(markup).toContain('data-nested="true"')
    expect(markup).toContain('Expand 1 branches · +2 messages')
    expect(markup).toContain('aria-label="Collapse branch 2.1"')
    expect(markup).toContain('Expand branch 2.2')
    expect(markup).toContain('Expand branch 2.3')
  })

  it('renders Alt-deep-expanded descendants as complete card groups', () => {
    const projection = collapseV2ProjectionFixture()
    const markup = renderWithViewState(viewState([], []), projection)

    expect(count(markup, 'role="treeitem"')).toBe(projection.nodes.length)
    expect(markup).toContain('A2.1.1')
    expect(markup).toContain('aria-label="Collapse branch 2.1.1"')
    expect(markup).not.toContain('data-mode="capsule"')
  })

  it('exposes streaming and failure state through folded controls', () => {
    const base = treeProjectionFixture()
    const projection = {
      ...base,
      nodes: base.nodes.map(node => node.nodeId === 'branch-1-a'
        ? { ...node, state: 'streaming' as const }
        : node),
    }
    const markup = renderWithViewState(viewState([], ['root-a2']), projection)

    expect(markup).toContain('data-activity="running"')
    expect(markup).toContain('Streaming')
  })

  it('implements the specified morph, stagger, ripple, and reduced-motion fallbacks', () => {
    const css = readFileSync(
      new URL('../src/client/view/ConversationTreeCanvas.module.css', import.meta.url),
      'utf8',
    )
    const component = readFileSync(
      new URL('../src/client/view/ConversationTreeCanvas.tsx', import.meta.url),
      'utf8',
    )
    expect(css).toContain('cubic-bezier(0.3, 1.4, 0.5, 1)')
    expect(css).toContain('transform: scale(0.88)')
    expect(css).toContain('transform: rotate(90deg)')
    expect(css).toContain('opacity 200ms ease 50ms')
    expect(css).toContain('450ms ease-out')
    expect(css).toContain('translateX(-10px) scale(0.96)')
    expect(css).toContain('capsule-absorb 180ms ease-in')
    expect(css).toContain('cubic-bezier(0.3, 1.15, 0.5, 1)')
    expect(css).toContain('capsule-row-out 160ms ease')
    expect(css).toContain('capsule-row-from-cards 200ms ease-in-out')
    expect(css).toContain('animation-delay: var(--fold-card-delay, 0ms)')
    expect(css).toContain('branch-card-exit 200ms ease-in-out')
    expect(css).toContain('opacity 150ms ease, transform 150ms ease')
    expect(component).toContain('* 70}ms`')
    expect(component).toContain('* 60}ms`')
    expect(component).toContain('position.depth - 1) * 260')
    expect(component).toContain('reverseIndex * 40')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('content: none')
  })
})
