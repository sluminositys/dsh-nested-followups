import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import type { ChatStoreState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const react = await import('react')
  return {
    Button: ({ children, variant: _variant, size: _size, icon, ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & {
      children?: ReactNode
      variant?: string
      size?: string
      icon?: ReactNode
    }) => react.createElement('button', props, icon, children),
    IconBranchOutline16: () => react.createElement('span', { 'aria-hidden': true }),
    Tooltip: ({ children }: { children: ReactNode }) => children,
  }
})

import { TreeViewHeaderAction } from '../src/client/TreeViewHeaderAction.tsx'
import { CHAT_VIEW_ID, TREE_VIEW_ID } from '../src/client/view-ids.ts'

const translations: Record<string, string> = {
  'view.tree': 'Tree View',
  'view.openTree': 'Open Tree View',
  'view.returnToChat': 'Return to Chat',
}

function renderAction(view: string | null, setView: (next: string) => void): ReactElement {
  return TreeViewHeaderAction({
    useStore: <S,>(selector: (state: ChatStoreState) => S): S => selector({
      selection: null,
      draft: '',
      view,
      inspect: null,
    }),
    actions: { setView },
    t: (key: string): string => translations[key] ?? key,
  } as never) as ReactElement
}

function buttonOf(action: ReactElement): ReactElement<ButtonHTMLAttributes<HTMLButtonElement>> {
  return action.props.children as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>
}

describe('Tree View header action', () => {
  it('opens Tree View from the native Chat view', () => {
    const setView = vi.fn()
    const button = buttonOf(renderAction(CHAT_VIEW_ID, setView))

    expect(button.props['aria-pressed']).toBe(false)
    expect(button.props['aria-label']).toBe('Open Tree View')
    button.props.onClick?.({} as never)
    expect(setView).toHaveBeenCalledWith(TREE_VIEW_ID)
  })

  it('returns to Chat when Tree View is already active', () => {
    const setView = vi.fn()
    const button = buttonOf(renderAction(TREE_VIEW_ID, setView))

    expect(button.props['aria-pressed']).toBe(true)
    expect(button.props['aria-label']).toBe('Return to Chat')
    button.props.onClick?.({} as never)
    expect(setView).toHaveBeenCalledWith(CHAT_VIEW_ID)
  })
})
