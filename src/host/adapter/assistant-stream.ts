import { BlockAssembler, type StreamChunk } from '@deepseek-ai/dsh-llm'

/** 0.2 keeps these frames process-local, outside the durable Session log. */
export type FollowupStreamFrame =
  | { readonly type: 'start'; readonly revision: number; readonly attemptId: string; readonly turn: number; readonly step: number }
  | { readonly type: 'chunk'; readonly revision: number; readonly attemptId: string; readonly index: number; readonly time: number; readonly chunk: StreamChunk }
  | { readonly type: 'end'; readonly revision: number; readonly attemptId: string; readonly index: number }

export interface LiveAssistantText {
  readonly turn: number
  readonly step: number
  readonly text: string
  readonly chunks: number
}

/** A read-only stream projection. Gaps discard partial text, never guess it. */
export class FollowupAssistantStream {
  private revision = 0
  private attempt: {
    readonly id: string
    readonly turn: number
    readonly step: number
    readonly assembler: BlockAssembler
    chunks: number
  } | undefined

  accept(frame: FollowupStreamFrame): void {
    if (frame.type === 'start' && frame.revision === 1) this.revision = 0
    if (frame.revision !== this.revision + 1) {
      this.attempt = undefined
      this.revision = frame.revision
      return
    }
    this.revision = frame.revision
    if (frame.type === 'start') {
      this.attempt = { id: frame.attemptId, turn: frame.turn, step: frame.step, assembler: new BlockAssembler(), chunks: 0 }
      return
    }
    if (frame.type === 'end') {
      this.attempt = undefined
      return
    }
    const attempt = this.attempt
    if (attempt === undefined || attempt.id !== frame.attemptId || attempt.chunks !== frame.index) {
      this.attempt = undefined
      return
    }
    try {
      attempt.assembler.push(frame.chunk)
      attempt.chunks += 1
    } catch {
      this.attempt = undefined
    }
  }

  snapshot(): LiveAssistantText | undefined {
    const attempt = this.attempt
    if (attempt === undefined) return undefined
    return {
      turn: attempt.turn,
      step: attempt.step,
      chunks: attempt.chunks,
      text: attempt.assembler.blocks()
        .filter(block => block.type === 'text')
        .map(block => block.text).join('\n\n'),
    }
  }
}

/** Legacy chunks are read from old logs only; never written by the plugin. */
export function legacyAssistantChunk(event: unknown): {
  readonly turn: number
  readonly step: number
  readonly chunk: StreamChunk
} | undefined {
  const candidate = event as { readonly type?: string; readonly data?: { readonly turn: number; readonly step: number; readonly chunk: StreamChunk } }
  return candidate.type === 'assistant/chunk' ? candidate.data : undefined
}
