import { describe, expect, it } from 'vitest'
import { FollowupAssistantStream, type FollowupStreamFrame } from '../src/host/adapter/assistant-stream.ts'

const start: FollowupStreamFrame = { type: 'start', revision: 1, attemptId: 'a', turn: 2, step: 1 }
const chunk: FollowupStreamFrame = { type: 'chunk', revision: 2, attemptId: 'a', index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'Answer' } }

describe('process-local assistant stream compatibility', () => {
  it('assembles native 0.2 frames without producing log events', () => {
    const stream = new FollowupAssistantStream()
    stream.accept(start)
    expect(stream.snapshot()).toEqual({ turn: 2, step: 1, text: '', chunks: 0 })
    stream.accept(chunk)
    expect(stream.snapshot()).toEqual({ turn: 2, step: 1, text: 'Answer', chunks: 1 })
    stream.accept({ ...chunk, revision: 3, index: 1, chunk: { type: 'text-delta', index: 0, text: ' continues' } })
    expect(stream.snapshot()?.text).toBe('Answer continues')
    stream.accept({ type: 'end', revision: 4, attemptId: 'a', index: 2 })
    expect(stream.snapshot()).toBeUndefined()
  })

  it.each([
    { ...chunk, revision: 4 },
    { ...chunk, index: 1 },
    { ...chunk, attemptId: 'other' },
  ])('discards inconsistent or incomplete frames: %j', invalid => {
    const stream = new FollowupAssistantStream()
    stream.accept(start)
    stream.accept(invalid)
    expect(stream.snapshot()).toBeUndefined()
  })

  it('resets partial output when the attached Agent lifecycle restarts', () => {
    const stream = new FollowupAssistantStream()
    stream.accept(start)
    stream.accept(chunk)
    stream.accept({ ...start, attemptId: 'replacement' })
    expect(stream.snapshot()?.text).toBe('')
    stream.accept({ ...chunk, attemptId: 'replacement', chunk: { type: 'text-delta', index: 0, text: 'New' } })
    expect(stream.snapshot()?.text).toBe('New')
  })
})
