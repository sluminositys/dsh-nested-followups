import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

export type BranchBoundaryErrorCode =
  | 'invalid-log'
  | 'anchor-not-found'
  | 'turn-open'
  | 'turn-tail-unavailable'

export class BranchBoundaryError extends Error {
  constructor(
    readonly code: BranchBoundaryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BranchBoundaryError'
  }
}

export interface ResolvedBranchBoundary {
  selectedMessageId: string
  selectedSeq: number
  anchorMessageId: string
  anchorSeq: number
  turn: number
  /** Inclusive event sequence of the completed turn marker. */
  forkBoundarySeq: number
  /** Number of events copied into the child before its own descriptor and prompt. */
  seedLength: number
  seed: readonly SessionEvent[]
  snappedToTurnTail: boolean
}

function hasVisibleText(content: readonly ContentBlock[]): boolean {
  return content.some(block => block.type === 'text' && block.text.trim().length > 0)
}

function isSurfaceMessage(event: SessionEvent): boolean {
  return event.type === 'user/message'
    || event.type === 'assistant/message'
    || event.type === 'tool/result'
}

function validateContiguous(events: readonly SessionEvent[]): void {
  for (let index = 0; index < events.length; index++) {
    if (events[index]?.seq !== index) {
      throw new BranchBoundaryError(
        'invalid-log',
        `session events must be contiguous from seq 0; expected ${index}, received ${String(events[index]?.seq)}`,
      )
    }
  }
}

/**
 * Resolve an assistant message to the completed turn tail that DSH can safely
 * seed. A later open turn does not affect an earlier completed turn.
 */
export function resolveBranchBoundary(
  events: readonly SessionEvent[],
  selectedMessageId: string,
): ResolvedBranchBoundary {
  validateContiguous(events)
  const selected = events.find((event): event is SessionEvent<'assistant/message'> =>
    event.type === 'assistant/message' && String(event.data.message.id) === selectedMessageId)
  if (selected === undefined) {
    throw new BranchBoundaryError(
      'anchor-not-found',
      `assistant message '${selectedMessageId}' is not present in the session log`,
    )
  }

  const turn = selected.data.turn
  const turnEnd = events.find((event): event is SessionEvent<'turn/end'> =>
    event.type === 'turn/end' && event.data.turn === turn && event.seq > selected.seq)
  if (turnEnd === undefined) {
    throw new BranchBoundaryError(
      'turn-open',
      `turn ${turn} containing assistant message '${selectedMessageId}' has not completed`,
    )
  }

  const turnSurface = events.filter(event =>
    event.seq <= turnEnd.seq
    && isSurfaceMessage(event)
    && (event.type !== 'assistant/message' || event.data.turn === turn))
  const finalSurface = turnSurface.at(-1)
  if (finalSurface?.type !== 'assistant/message'
    || finalSurface.data.turn !== turn
    || !hasVisibleText(finalSurface.data.message.content)) {
    throw new BranchBoundaryError(
      'turn-tail-unavailable',
      `turn ${turn} does not end in a finalized assistant text message`,
    )
  }

  let seedLength = turnEnd.seq + 1
  while (seedLength < events.length && events[seedLength]?.type !== 'turn/start') seedLength++
  const anchorMessageId = String(finalSurface.data.message.id)
  return Object.freeze({
    selectedMessageId,
    selectedSeq: selected.seq,
    anchorMessageId,
    anchorSeq: finalSurface.seq,
    turn,
    forkBoundarySeq: turnEnd.seq,
    seedLength,
    seed: Object.freeze(events.slice(0, seedLength)),
    snappedToTurnTail: anchorMessageId !== selectedMessageId,
  })
}
