import { Session, SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'

import {
  persistedSeedLength,
  listPersistedSessions,
  readPersistedSessionFrom,
  sessionSeedLength,
  snapshotSessionEvents,
  usesInheritedEventCount,
} from '../src/host/adapter/session-compat.ts'

const event = Object.freeze({
  type: 'turn/start',
  seq: 0,
  time: 1,
  data: { turn: 1 },
}) as SessionEvent

describe('DSH Session compatibility boundary', () => {
  it('reads the rc event snapshot and header seed length', () => {
    const session = {
      header: {
        version: 1,
        id: SessionId('rc-session'),
        createdAt: 1,
        seedLength: 1,
      },
      events: [event],
    } as unknown as Session

    expect(snapshotSessionEvents(session)).toEqual([event])
    expect(sessionSeedLength(session)).toBe(1)
    expect(usesInheritedEventCount(session.header)).toBe(false)
  })

  it('reads the 0.1.2 snapshot and inherited event count structurally', () => {
    const header = {
      version: 1,
      id: SessionId('alpha-session'),
      createdAt: 1,
      isSeeded: true,
      origin: 'subagent',
    } as unknown as SessionHeader
    const session = {
      header,
      snapshotEvents: vi.fn(() => [event]),
      inheritedEventCount: 1,
    } as unknown as Session

    expect(snapshotSessionEvents(session)).toEqual([event])
    expect(sessionSeedLength(session)).toBe(1)
    expect(usesInheritedEventCount(header)).toBe(true)
  })

  it('reads either persistence representation and preserves numeric offsets', async () => {
    const rc = {
      meta: {
        version: 1,
        id: SessionId('rc-stored'),
        createdAt: 1,
        seedLength: 2,
      } as unknown as SessionHeader,
      events: [event],
    }
    const alpha = {
      meta: {
        version: 1,
        id: SessionId('alpha-stored'),
        createdAt: 1,
        isSeeded: true,
      } as unknown as SessionHeader,
      inheritedEventCount: 3,
      events: [event],
    }
    expect(persistedSeedLength(rc)).toBe(2)
    expect(persistedSeedLength(alpha)).toBe(3)

    const readFrom = vi.fn(async () => alpha)
    await expect(readPersistedSessionFrom({ readFrom }, SessionId('alpha-stored'), 1))
      .resolves.toBe(alpha)
    expect(readFrom).toHaveBeenCalledWith(SessionId('alpha-stored'), 1)
  })

  it('opens a 0.2 read handle, not a writer, and always closes it', async () => {
    const close = vi.fn(async () => {})
    const read = vi.fn(async () => ({ events: [event] }))
    const header = Session.create(SessionId('handle-session')).header
    const open = vi.fn(async () => ({ header, inheritedEventCount: 0, read, close }))
    const readFrom = vi.fn()
    await expect(readPersistedSessionFrom({ open, readFrom }, header.id, 7)).resolves.toEqual({
      meta: header, inheritedEventCount: 0, events: [event],
    })
    expect(open).toHaveBeenCalledWith(header.id, 'read')
    expect(read).toHaveBeenCalledWith(7)
    expect(close).toHaveBeenCalledOnce()
    expect(readFrom).not.toHaveBeenCalled()
    read.mockRejectedValueOnce(new Error('read failed'))
    await expect(readPersistedSessionFrom({ open }, header.id, 0)).rejects.toThrow('read failed')
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('lists headers with either the legacy or handle-era method', async () => {
    const rows = [{ header: Session.create(SessionId('listed')).header, revision: 'test' }]
    const list = vi.fn(async () => rows)
    const listSnapshots = vi.fn(async () => rows)
    expect(await listPersistedSessions({ list })).toBe(rows)
    expect(await listPersistedSessions({ listSnapshots })).toBe(rows)
    expect(await listPersistedSessions({ list, listSnapshots })).toBe(rows)
    expect(list).toHaveBeenCalledOnce()
  })
})
