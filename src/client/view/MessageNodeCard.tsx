import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import {
  IconChevronUpOutline14,
  IconInspectOutline12,
  IconPlusOutline16,
  IconRightUpOutline16,
  IconTrashOutline16,
  StateDot,
  Tooltip,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { displayLabelOf } from '../../shared/labels.ts'
import type { MessageNodeView } from '../../shared/types.ts'
import type { TreeViewLabels } from './contracts.ts'
import css from './ConversationTreeCanvas.module.css'

interface MessageNodeCardProps {
  readonly node: MessageNodeView
  readonly style: CSSProperties
  readonly labels: TreeViewLabels
  readonly timestamp: string
  readonly selected: boolean
  readonly focused: boolean
  readonly dimmed: boolean
  readonly root: boolean
  readonly firstInBranch: boolean
  readonly canAsk: boolean
  readonly canOpen: boolean
  readonly canDelete: boolean
  readonly onSelect: () => void
  readonly onAsk: () => void
  readonly onFocus: () => void
  readonly onOpen: () => void
  readonly onCollapse: () => void
  readonly onDelete: () => void
}

function stateDot(state: MessageNodeView['state']): StateDotState {
  switch (state) {
    case 'queued': return 'warning'
    case 'streaming': return 'ongoing'
    case 'complete': return 'done'
    case 'error': return 'error'
  }
}

function statusLabel(state: MessageNodeView['state'], labels: TreeViewLabels): string {
  switch (state) {
    case 'queued': return labels.queued
    case 'streaming': return labels.streaming
    case 'complete': return labels.complete
    case 'error': return labels.error
  }
}

function stop(event: MouseEvent<HTMLButtonElement>): void {
  event.stopPropagation()
}

export function MessageNodeCard({
  node,
  style,
  labels,
  timestamp,
  selected,
  focused,
  dimmed,
  root,
  firstInBranch,
  canAsk,
  canOpen,
  canDelete,
  onSelect,
  onAsk,
  onFocus,
  onOpen,
  onCollapse,
  onDelete,
}: MessageNodeCardProps) {
  const label = displayLabelOf(node)
  const role = node.role === 'user' ? labels.you : labels.assistant
  const status = statusLabel(node.state, labels)
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect()
  }

  return (
    <article
      className={css.nodeCard}
      style={style}
      role="treeitem"
      tabIndex={0}
      aria-label={`${label}, ${role}, ${status}`}
      aria-selected={selected}
      data-role={node.role}
      data-root={root || undefined}
      data-selected={selected || undefined}
      data-focused={focused || undefined}
      data-dimmed={dimmed || undefined}
      data-state={node.state}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <header className={css.nodeHeader}>
        <span className={css.nodeLabel}>{label}</span>
        <span className={css.nodeRole}>{role}</span>
        <time className={css.nodeTime} dateTime={new Date(node.time).toISOString()}>{timestamp}</time>
      </header>
      <p className={css.nodeSummary}>{node.summary}</p>
      <footer className={css.nodeFooter}>
        <span className={css.nodeStatus} title={status}>
          <StateDot state={stateDot(node.state)} />
          <span>{status}</span>
        </span>
        <span className={css.nodeActions}>
          {canAsk && (
            <Tooltip label={labels.askFollowUp} side="bottom">
              <button
                type="button"
                className={css.iconButton}
                aria-label={labels.askFollowUp}
                onClick={(event) => { stop(event); onAsk() }}
              >
                <IconPlusOutline16 size={14} />
              </button>
            </Tooltip>
          )}
          <Tooltip label={focused ? labels.clearFocus : labels.focus} side="bottom">
            <button
              type="button"
              className={css.iconButton}
              aria-label={focused ? labels.clearFocus : labels.focus}
              aria-pressed={focused}
              onClick={(event) => { stop(event); onFocus() }}
            >
              <IconInspectOutline12 size={12} />
            </button>
          </Tooltip>
          {canOpen && (
            <Tooltip label={labels.openBranch} side="bottom">
              <button
                type="button"
                className={css.iconButton}
                aria-label={labels.openBranch}
                onClick={(event) => { stop(event); onOpen() }}
              >
                <IconRightUpOutline16 size={14} />
              </button>
            </Tooltip>
          )}
          {firstInBranch && (
            <Tooltip label={labels.collapse} side="bottom">
              <button
                type="button"
                className={css.iconButton}
                aria-label={labels.collapse}
                onClick={(event) => { stop(event); onCollapse() }}
              >
                <IconChevronUpOutline14 size={14} />
              </button>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip label={labels.deleteBranch} side="bottom">
              <button
                type="button"
                className={css.iconButton}
                data-danger="true"
                aria-label={labels.deleteBranch}
                onClick={(event) => { stop(event); onDelete() }}
              >
                <IconTrashOutline16 size={14} />
              </button>
            </Tooltip>
          )}
        </span>
      </footer>
    </article>
  )
}
