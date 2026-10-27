import type { Context } from '@deepseek-ai/cordis'
import type { ActionsDecl, StoreHandle } from '@deepseek-ai/dsh-client-ui-slots'

/** Minimal cross-version view state shared by rc ChatStore and alpha ConversationStore. */
export interface ConversationViewState {
  view: string | null
}

export type ConversationViewActions = ActionsDecl<ConversationViewState> & {
  readonly setView: (draft: ConversationViewState, view: string) => void
}

export type ConversationViewStore = StoreHandle<ConversationViewState, ConversationViewActions>

interface CompatibleSlotEntry {
  readonly store?: unknown
}

interface CompatibleSlotRegistry {
  entriesOfSlot(name: string): readonly CompatibleSlotEntry[]
  inject(name: string, contribution: () => (() => void)): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Supplied by rc client-runtime or the 0.1.2 ui-renderer split. */
    slots: CompatibleSlotRegistry
  }

  interface Events {
    /** Supplied by the browser connection runtime in both supported lines. */
    'connection/reset'(): void
  }
}

/**
 * Read the Conversation view store seat without naming its unstable exported
 * type (`ChatStore` on rc, `ConversationStore` on 0.1.2).
 */
export function conversationViewStore(ctx: Context): ConversationViewStore | undefined {
  const store = ctx.slots.entriesOfSlot('conversation.session.header')[0]?.store
  if (store === undefined || typeof store === 'function') return undefined
  const candidate = store as unknown as {
    readonly create?: unknown
    readonly spec?: { readonly actions?: { readonly setView?: unknown } }
  }
  if (typeof candidate.create !== 'function') return undefined
  if (typeof candidate.spec?.actions?.setView !== 'function') return undefined
  return store as unknown as ConversationViewStore
}
