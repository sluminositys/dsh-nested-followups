import { readFileSync } from 'node:fs'
import { Context, Service } from '@deepseek-ai/cordis'
import * as nativeSlots from '@deepseek-ai/dsh-client-ui-slots'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'

// Rendering is covered separately. Keep the browser-only primitives out of this
// Node test while exercising the real entry, Cordis lifecycle and SlotCore.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ MarkdownText: () => null }))

import * as clientEntry from '../src/client/index.ts'
import type { ConversationTreeViewInjected } from '../src/client/ConversationTreeView.tsx'
import { NS } from '../src/client/locales.ts'
import { TreeProjectionController } from '../src/client/projection-controller.ts'
import remoteContribution from '../src/client/remote.ts'
import { CHAT_VIEW_ID, TREE_VIEW_ID } from '../src/client/view-ids.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

interface Registration {
  readonly options: { readonly id?: string }
  readonly store?: unknown
  readonly inject?: (...args: never[]) => unknown
}

/** Type-erased public SlotCore surface, matching the plugin's dynamic boundary. */
interface Core {
  entriesOfSlot(name: string): readonly Registration[]
  specDynamic(name: string): unknown
  register(options: Record<string, unknown>, component: unknown): () => void
  subscribeDeclaration(name: string, listener: () => void): () => void
}

const CurrentSlotCore = (nativeSlots as unknown as { SlotCore?: new () => Core }).SlotCore
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  devDependencies: Record<string, string>
}
const isLegacyTarget = (manifest.devDependencies['@deepseek-ai/dsh-client-ui-slots'] ?? '').startsWith('0.1.')

function createCore(): Core {
  if (CurrentSlotCore === undefined) throw new Error('This test requires the current public SlotCore.')
  return new CurrentSlotCore()
}

/** The Service wrapper only supplies Cordis ownership around the real core. */
class SlotsHarness extends Service {
  readonly core = createCore()

  constructor(ctx: Context) { super(ctx, 'slots') }

  entriesOfSlot(name: string) { return this.core.entriesOfSlot(name) }

  register(options: Record<string, unknown>, component: unknown): () => void {
    return this.ctx.effect(() => this.core.register(options, component), 'test: slot registration')
  }

  inject(name: string, contribution: () => (() => void)): void {
    this.ctx.effect(() => {
      let dispose: (() => void) | undefined
      const refresh = (): void => {
        dispose?.()
        dispose = this.core.specDynamic(name) === undefined ? undefined : contribution()
      }
      refresh()
      const unsubscribe = this.core.subscribeDeclaration(name, refresh)
      return () => { unsubscribe(); dispose?.() }
    }, 'test: slot declaration subscription')
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

// A minimal public StoreHandle seat: init + draft actions + create. The renderer
// is not instantiated here; SlotCore validates its identity and session scope.
function conversationStore() {
  return {
    spec: {
      init: () => ({ view: CHAT_VIEW_ID as string | null }),
      actions: { setView: (draft: { view: string | null }, view: string) => { draft.view = view } },
    },
    create: vi.fn(),
  }
}

async function setup(options: { headerStore?: boolean; delayedSlots?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotsHarness)
  const slots = ctx.get('slots') as unknown as SlotsHarness
  const mount = deferred<() => Promise<void>>()
  const unmount = vi.fn(async () => {})
  const unregisterLocale = vi.fn()
  const registerLocale = vi.fn(() => unregisterLocale)
  const remote = { $mount: vi.fn(() => mount.promise), nestedFollowups: {
    readTree: vi.fn(async () => ({
      ok: true,
      value: {
        ok: true,
        value: {
          rootSessionId: 'root', revision: 1,
          capabilities: {
            askFollowUp: false, continueBranch: false, nativeBranchContinuation: false,
            deletion: { supported: false, reason: 'test' },
          },
          projection: treeProjectionFixture(),
        },
      },
    })),
  } }
  ctx.provide('remote', remote)
  ctx.provide('locale', { register: registerLocale, bind: () => (key: string) => key })
  const viewStore = conversationStore()
  const declareSlots = (): void => {
    slots.core.register({ name: 'root', children: {
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.session.header': { kind: 'single', scope: 'session' },
    } }, () => null)
    slots.core.register({
      name: 'conversation.session.header',
      children: { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } },
      ...(options.headerStore === false ? {} : { store: viewStore }),
    }, () => null)
  }
  if (!options.delayedSlots) declareSlots()
  const fiber = ctx.plugin(clientEntry)
  const provideNamespace = () => ctx.provide('remote.nestedFollowups', remote.nestedFollowups)
  return { ctx, slots, fiber, mount, unmount, remote, registerLocale, unregisterLocale,
    viewStore, declareSlots, provideNamespace, dispose: () => ctx.fiber.dispose() }
}

// Legacy hosts predate the independently exported SlotCore. Their compatibility
// remains covered by the legacy component and host tests rather than a fake core.
// A missing SlotCore on a current target must fail, not silently skip the suite.
describe.skipIf(isLegacyTarget && CurrentSlotCore === undefined)('current DSH client registration', () => {
  it('waits for the Remote mount and namespace before registering the real view and header seats', async () => {
    const h = await setup()
    try {
      await vi.waitFor(() => expect(h.remote.$mount).toHaveBeenCalledWith(remoteContribution))
      expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(0)
      expect(h.registerLocale).not.toHaveBeenCalled()
      h.mount.resolve(h.unmount)
      await h.fiber
      expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(0)

      h.provideNamespace()
      await vi.waitFor(() => expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(1))
      const view = h.slots.entriesOfSlot('conversation.view')[0]!
      const toggle = h.slots.entriesOfSlot('conversation.session.header.utilities')[0]!
      expect(view.options.id).toBe(TREE_VIEW_ID)
      expect(toggle.options.id).toBe('nested-followups-tree-toggle')
      expect(toggle.store).toBe(h.viewStore)
      expect(h.viewStore.create).not.toHaveBeenCalled()
      expect(h.registerLocale).toHaveBeenCalledWith(NS, expect.objectContaining({ zh: expect.any(Object), en: expect.any(Object) }))

      const injected = view.inject!(SessionId('root') as never) as ConversationTreeViewInjected
      expect(await injected.ensure()).toBe(true)
      expect(h.remote.nestedFollowups.readTree).toHaveBeenCalledWith({ sessionId: 'root' })
      expect(injected.hooks.treeProjection.getSnapshot().status).toBe('ready')
    } finally { await h.dispose() }
  })

  it('unloads Remote, dictionaries, controllers, event handlers and both slot contributions together', async () => {
    const h = await setup()
    const disposed = vi.spyOn(TreeProjectionController.prototype, 'dispose')
    const reconnect = vi.spyOn(TreeProjectionController.prototype, 'reconnect')
    try {
      h.mount.resolve(h.unmount)
      h.provideNamespace()
      await h.fiber
      await vi.waitFor(() => expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(1))
      h.slots.entriesOfSlot('conversation.view')[0]!.inject!(SessionId('root') as never)
      h.ctx.emit('connection/reset')
      expect(reconnect).toHaveBeenCalledTimes(1)

      await h.fiber.dispose()
      expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(0)
      expect(h.slots.entriesOfSlot('conversation.session.header.utilities')).toHaveLength(0)
      expect(h.unmount).toHaveBeenCalledTimes(1)
      expect(h.unregisterLocale).toHaveBeenCalledTimes(1)
      expect(disposed).toHaveBeenCalledTimes(1)
      h.ctx.emit('connection/reset')
      expect(reconnect).toHaveBeenCalledTimes(1)
    } finally {
      await h.dispose()
      disposed.mockRestore()
      reconnect.mockRestore()
    }
  })

  it('registers when official slots arrive after the Remote and degrades a missing shared store', async () => {
    const h = await setup({ delayedSlots: true, headerStore: false })
    try {
      h.mount.resolve(h.unmount)
      h.provideNamespace()
      await h.fiber
      expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(0)
      h.declareSlots()
      await vi.waitFor(() => expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(1))
      expect(h.slots.entriesOfSlot('conversation.session.header.utilities')).toHaveLength(0)
    } finally { await h.dispose() }
  })

  it('does not install UI or dictionaries when the official Remote mount rejects', async () => {
    const h = await setup()
    try {
      h.mount.reject(new Error('Remote transport unavailable'))
      await expect(h.fiber).rejects.toThrow('Remote transport unavailable')
      expect(h.slots.entriesOfSlot('conversation.view')).toHaveLength(0)
      expect(h.slots.entriesOfSlot('conversation.session.header.utilities')).toHaveLength(0)
      expect(h.registerLocale).not.toHaveBeenCalled()
      expect(h.unmount).not.toHaveBeenCalled()
    } finally { await h.dispose() }
  })
})
