import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import {
  IconChevronDownOutline14,
  IconPlusOutline16,
  IconTrashOutline16,
  StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { CanvasTooltip } from './CanvasTooltip.tsx'
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
  readonly quote?: string
  readonly quoteInvalid: boolean
  readonly canAsk: boolean
  readonly askDisabledReason?: string
  readonly canContinue: boolean
  readonly canDelete: boolean
  readonly onSelect: () => void
  readonly onAsk: () => void
  readonly onContinue: () => void
  readonly onFocus: () => void
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

/**
 * Crosshair glyph for the Focus action. The shared icon set has no
 * target/focus symbol, and the closest match (IconInspect) reads as a code
 * bracket, which users mistook for a quoting feature.
 */
function FocusTargetIcon({ size = 13 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      <path d="M8 0.8v2.4M8 12.8v2.4M0.8 8h2.4M12.8 8h2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
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
  quote,
  quoteInvalid,
  canAsk,
  askDisabledReason,
  canContinue,
  canDelete,
  onSelect,
  onAsk,
  onContinue,
  onFocus,
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
      data-first-in-branch={firstInBranch || undefined}
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
      {quote !== undefined && (
        <blockquote className={css.anchorQuote} aria-label={labels.quoteSelected}>{quote}</blockquote>
      )}
      {quoteInvalid && <p className={css.invalidQuote} role="status">{labels.quoteInvalid}</p>}
      <p className={css.nodeSummary}>{node.summary}</p>
      <footer className={css.nodeFooter}>
        <span className={css.nodeStatus} title={status}>
          <StateDot state={stateDot(node.state)} />
          <span>{status}</span>
        </span>
        <span className={css.nodeActions}>
          {(canAsk || askDisabledReason !== undefined) && (
            <CanvasTooltip label={askDisabledReason ?? labels.askFollowUp}>
              <button
                type="button"
                className={css.iconButton}
                aria-label={labels.askFollowUp}
                aria-disabled={!canAsk || undefined}
                {...askDisabledReason === undefined ? {} : { 'aria-description': askDisabledReason }}
                onClick={(event) => {
                  stop(event)
                  if (canAsk) onAsk()
                }}
              >
                <IconPlusOutline16 size={14} />
              </button>
            </CanvasTooltip>
          )}
          {canContinue && (
            <CanvasTooltip label={labels.continueBranch}>
              <button
                type="button"
                className={css.continueButton}
                aria-label={labels.continueBranch}
                onClick={(event) => { stop(event); onContinue() }}
              >
                <IconChevronDownOutline14 size={14} />
                <span>{labels.continueBranch}</span>
              </button>
            </CanvasTooltip>
          )}
          <CanvasTooltip label={focused ? labels.clearFocus : labels.focus}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={focused ? labels.clearFocus : labels.focus}
              aria-pressed={focused}
              onClick={(event) => { stop(event); onFocus() }}
            >
              <FocusTargetIcon size={13} />
            </button>
          </CanvasTooltip>
          {canDelete && (
            <CanvasTooltip label={labels.deleteBranch}>
              <button
                type="button"
                className={css.iconButton}
                data-danger="true"
                aria-label={labels.deleteBranch}
                onClick={(event) => { stop(event); onDelete() }}
              >
                <IconTrashOutline16 size={14} />
              </button>
            </CanvasTooltip>
          )}
        </span>
      </footer>
    </article>
  )
}
