import { describe, expect, it, vi } from 'vitest'

import { TreeProjectionController } from '../src/client/projection-controller.ts'
import type { NestedFollowupsRemoteNamespace } from '../src/client/remote.ts'
import type { TreeSnapshot, TreeWatchResult } from '../src/shared/remote.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

function snapshot(revision: number): TreeSnapshot {
  return {
    rootSessionId: 'root',
    revision,
    capabilities: {
      askFollowUp: true,
      continueBranch: true,
      nativeBranchContinuation: false,
      deletion: { supported: true, mode: 'archive' },
    },
    projection: treeProjectionFixture(),
  }
}

function readEnvelope(
  revision: number,
): Awaited<ReturnType<NestedFollowupsRemoteNamespace['readTree']>> {
  return { ok: true, value: { ok: true, value: snapshot(revision) } }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

describe('tree projection controller', () => {
  it('loads once and replaces the projection after one changed revision', async () => {
    const watch = deferred<Awaited<ReturnType<NestedFollowupsRemoteNamespace['watchTree']>>>()
    const nextWatch = deferred<Awaited<ReturnType<NestedFollowupsRemoteNamespace['watchTree']>>>()
    const remote: NestedFollowupsRemoteNamespace = {
      readTree: vi.fn(async () => readEnvelope(0)),
      watchTree: vi.fn()
        .mockImplementationOnce(() => watch.promise)
        .mockImplementation(() => nextWatch.promise),
      createBranch: vi.fn(),
      continueBranch: vi.fn(),
      deleteBranch: vi.fn(),
    }
    const controller = new TreeProjectionController(remote, 'root')
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('ready') })
    expect(controller.getSnapshot().snapshot?.revision).toBe(0)
    expect(remote.readTree).toHaveBeenCalledTimes(1)
    expect(remote.watchTree).toHaveBeenCalledWith({ sessionId: 'root', afterRevision: 0 })

    watch.resolve({ ok: true, value: { ok: true, value: { changed: true, snapshot: snapshot(1) } } })
    await vi.waitFor(() => { expect(controller.getSnapshot().snapshot?.revision).toBe(1) })
    expect(controller.getSnapshot().error).toBeNull()

    unsubscribe()
    controller.dispose()
  })

  it('keeps the last projection visible when the carrier fails', async () => {
    const firstWatch = deferred<Awaited<ReturnType<NestedFollowupsRemoteNamespace['watchTree']>>>()
    const remote: NestedFollowupsRemoteNamespace = {
      readTree: vi.fn(async () => readEnvelope(4)),
      watchTree: vi.fn(() => firstWatch.promise),
      createBranch: vi.fn(),
      continueBranch: vi.fn(),
      deleteBranch: vi.fn(),
    }
    const controller = new TreeProjectionController(remote, 'root')
    const unsubscribe = controller.subscribe(() => {})
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('ready') })

    firstWatch.resolve({
      ok: false,
      error: { code: 'disconnected', message: 'connection reset', details: {} },
    })
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe('error') })
    expect(controller.getSnapshot().snapshot?.revision).toBe(4)
    expect(controller.getSnapshot().error).toContain('connection reset')

    unsubscribe()
    controller.dispose()
  })

  it('accepts idle watch heartbeats without changing the snapshot', async () => {
    const heartbeat: TreeWatchResult = { ok: true, value: { changed: false, revision: 3 } }
    const secondWatch = deferred<Awaited<ReturnType<NestedFollowupsRemoteNamespace['watchTree']>>>()
    const remote: NestedFollowupsRemoteNamespace = {
      readTree: vi.fn(async () => readEnvelope(3)),
      watchTree: vi.fn()
        .mockResolvedValueOnce({ ok: true, value: heartbeat })
        .mockImplementationOnce(() => secondWatch.promise),
      createBranch: vi.fn(),
      continueBranch: vi.fn(),
      deleteBranch: vi.fn(),
    }
    const controller = new TreeProjectionController(remote, 'root')
    const unsubscribe = controller.subscribe(() => {})
    await vi.waitFor(() => { expect(remote.watchTree).toHaveBeenCalledTimes(2) })
    expect(controller.getSnapshot().snapshot?.revision).toBe(3)
    expect(controller.getSnapshot().status).toBe('ready')

    unsubscribe()
    controller.dispose()
  })
})
