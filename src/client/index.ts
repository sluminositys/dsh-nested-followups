import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ChatStore } from '@deepseek-ai/dsh-client-ui-conversation/client'

import { ConversationTreeView, type ConversationTreeViewInjected } from './ConversationTreeView.tsx'
import { en, NS, zh } from './locales.ts'
import { TreeProjectionController } from './projection-controller.ts'
import remoteContribution from './remote.ts'
import { TreeViewHeaderAction } from './TreeViewHeaderAction.tsx'
import { TREE_VIEW_ID } from './view-ids.ts'

export * from './tree/index.ts'
export * from './view/index.ts'
export { ConversationTreeView } from './ConversationTreeView.tsx'
export { TreeProjectionController } from './projection-controller.ts'
export { TreeViewHeaderAction } from './TreeViewHeaderAction.tsx'
export { CHAT_VIEW_ID, TREE_VIEW_ID } from './view-ids.ts'

export const name = 'dsh-nested-followups/client'
export const inject = ['slots', 'remote', 'locale']

function commandError(error: { code: string; message?: string }): Error {
  return new Error(error.message === undefined ? error.code : `${error.code}: ${error.message}`)
}

/**
 * Resolve the native conversation header's shared Chat store. Reusing this
 * official store seat lets a header utility call the same `setView` action as
 * the built-in tabs without reaching into the DOM or duplicating view state.
 */
function conversationChatStore(ctx: ClientContext): ChatStore | undefined {
  const store = ctx.slots.entriesOfSlot('conversation.session.header')[0]?.store
  if (store === undefined || typeof store === 'function') return undefined
  if (typeof store.create !== 'function') return undefined
  if (typeof store.spec?.actions?.setView !== 'function') return undefined
  return store as ChatStore
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remoteContribution)
  ctx.inject(['remote.nestedFollowups'], (remoteCtx: ClientContext) => {
    installTreeUi(remoteCtx)
  })
  return disposeRemote
}

function installTreeUi(ctx: ClientContext): void {
  const controllers = new Map<SessionId, TreeProjectionController>()
  const controllerFor = (sessionId: SessionId): TreeProjectionController => {
    let controller = controllers.get(sessionId)
    if (controller === undefined) {
      controller = new TreeProjectionController(ctx.remote.nestedFollowups, String(sessionId))
      controllers.set(sessionId, controller)
    }
    return controller
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'nested-followups: client dictionaries')
  ctx.effect(() => () => {
    for (const controller of controllers.values()) controller.dispose()
    controllers.clear()
  }, 'nested-followups: tree projection controllers')
  ctx.on('connection/reset', () => {
    for (const controller of controllers.values()) controller.reconnect()
  })

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: TREE_VIEW_ID,
    order: 20,
    locale: NS,
    label: () => t('view.tree'),
    inject: (sessionId: SessionId): ConversationTreeViewInjected => {
      const controller = controllerFor(sessionId)
      return {
        hooks: { treeProjection: controller },
        ensure: () => controller.ensure(),
        askFollowUp: async ({ clientRequestId, anchor, question, anchorRange }) => {
          const result = await ctx.remote.nestedFollowups.createBranch({
            ownerSessionId: String(sessionId),
            clientRequestId,
            anchor: {
              sessionId: anchor.sessionId,
              messageId: anchor.messageId,
              seq: anchor.seq,
              ...(anchorRange === undefined ? {} : { range: anchorRange }),
            },
            question,
          })
          if (!result.ok) throw commandError(result.error)
          if (!result.value.ok) throw commandError(result.value.error)
        },
        continueBranch: async ({ clientRequestId, tail, question }) => {
          if (tail.branchId === null) throw new Error('Continue is not available on the main conversation.')
          const result = await ctx.remote.nestedFollowups.continueBranch({
            ownerSessionId: String(sessionId),
            clientRequestId,
            branchId: tail.branchId,
            tail: {
              sessionId: tail.sessionId,
              messageId: tail.messageId,
              seq: tail.seq,
            },
            question,
          })
          if (!result.ok) throw commandError(result.error)
          if (!result.value.ok) throw commandError(result.value.error)
        },
        deleteBranch: async ({ branchId }) => {
          const result = await ctx.remote.nestedFollowups.deleteBranch({
            ownerSessionId: String(sessionId),
            branchId,
          })
          if (!result.ok) throw commandError(result.error)
          if (!result.value.ok) throw commandError(result.value.error)
        },
      }
    },
  }, ConversationTreeView))

  ctx.slots.inject('conversation.session.header.utilities', () => {
    const chatStore = conversationChatStore(ctx)
    if (chatStore === undefined) return () => {}
    return ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'nested-followups-tree-toggle',
      order: 20,
      locale: NS,
      store: chatStore,
    }, TreeViewHeaderAction)
  })

}
