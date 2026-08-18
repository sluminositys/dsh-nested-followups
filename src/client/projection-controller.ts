import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

import type { TreeSnapshot } from '../shared/remote.ts'
import type { NestedFollowupsRemoteNamespace } from './remote.ts'

export type TreeProjectionStatus = 'cold' | 'loading' | 'ready' | 'error'

export interface TreeProjectionView {
  readonly status: TreeProjectionStatus
  readonly snapshot: TreeSnapshot | null
  readonly error: string | null
}

const INITIAL_VIEW: TreeProjectionView = Object.freeze({
  status: 'cold',
  snapshot: null,
  error: null,
})

function failure(error: { code: string; message?: string }): string {
  return error.message === undefined || error.message === ''
    ? error.code
    : `${error.code}: ${error.message}`
}

/** Session-scoped browser cache backed by one event-driven Host long poll. */
export class TreeProjectionController implements HostObservable<TreeProjectionView> {
  private view = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private loadPromise: Promise<boolean> | null = null
  private generation = 0
  private disposed = false

  constructor(
    private readonly remote: NestedFollowupsRemoteNamespace,
    private readonly sessionId: string,
  ) {}

  getSnapshot = (): TreeProjectionView => this.view

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.generation += 1
    }
  }

  ensure(): Promise<boolean> {
    if (this.view.status === 'ready') return Promise.resolve(true)
    if (this.loadPromise !== null) return this.loadPromise
    this.publish({ status: 'loading', snapshot: this.view.snapshot, error: null })
    const pending = this.load()
    this.loadPromise = pending
    return pending.finally(() => { this.loadPromise = null })
  }

  reconnect(): void {
    if (this.disposed) return
    this.generation += 1
    this.publish({ status: 'cold', snapshot: this.view.snapshot, error: null })
    if (this.listeners.size > 0) this.start()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.listeners.clear()
  }

  private start(): void {
    const generation = ++this.generation
    void this.watch(generation)
  }

  private async watch(generation: number): Promise<void> {
    if (!(await this.ensure())) return
    while (!this.disposed && this.listeners.size > 0 && generation === this.generation) {
      const snapshot = this.view.snapshot
      if (snapshot === null) return
      let result: Awaited<ReturnType<NestedFollowupsRemoteNamespace['watchTree']>>
      try {
        result = await this.remote.watchTree({
          sessionId: this.sessionId,
          afterRevision: snapshot.revision,
        })
      } catch (error) {
        this.publish({ status: 'error', snapshot, error: String(error) })
        return
      }
      if (generation !== this.generation || this.disposed) return
      if (!result.ok) {
        this.publish({ status: 'error', snapshot, error: failure(result.error) })
        return
      }
      if (!result.value.ok) {
        this.publish({ status: 'error', snapshot, error: result.value.error.code })
        return
      }
      if (result.value.value.changed) {
        this.publish({ status: 'ready', snapshot: result.value.value.snapshot, error: null })
      }
    }
  }

  private async load(): Promise<boolean> {
    let result: Awaited<ReturnType<NestedFollowupsRemoteNamespace['readTree']>>
    try {
      result = await this.remote.readTree({ sessionId: this.sessionId })
    } catch (error) {
      this.publish({ status: 'error', snapshot: this.view.snapshot, error: String(error) })
      return false
    }
    if (!result.ok) {
      this.publish({ status: 'error', snapshot: this.view.snapshot, error: failure(result.error) })
      return false
    }
    if (!result.value.ok) {
      this.publish({ status: 'error', snapshot: this.view.snapshot, error: result.value.error.code })
      return false
    }
    this.publish({ status: 'ready', snapshot: result.value.value, error: null })
    return true
  }

  private publish(view: TreeProjectionView): void {
    if (this.disposed) return
    this.view = Object.freeze(view)
    const listeners = Array.from(this.listeners)
    for (const listener of listeners) listener()
  }
}
