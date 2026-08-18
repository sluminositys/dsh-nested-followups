import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import { ConversationTreeView, type ConversationTreeViewInjected } from './ConversationTreeView.tsx'
import { en, NS, zh } from './locales.ts'
import { TreeProjectionController } from './projection-controller.ts'
import remoteContribution from './remote.ts'

export * from './tree/index.ts'
export * from './view/index.ts'
export { ConversationTreeView } from './ConversationTreeView.tsx'
export { TreeProjectionController } from './projection-controller.ts'

export const name = 'dsh-nested-followups/client'
export const inject = ['slots', 'remote', 'locale']

function commandError(error: { code: string; message?: string }): Error {
  return new Error(error.message === undefined ? error.code : `${error.code}: ${error.message}`)
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remoteContribution)
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
    id: 'nested-followups-tree',
    order: 20,
    locale: NS,
    label: () => t('view.tree'),
    inject: (sessionId: SessionId): ConversationTreeViewInjected => {
      const controller = controllerFor(sessionId)
      return {
        hooks: { treeProjection: controller },
        ensure: () => controller.ensure(),
        askFollowUp: async ({ anchor, question }) => {
          const result = await ctx.remote.nestedFollowups.createBranch({
            ownerSessionId: String(sessionId),
            clientRequestId: crypto.randomUUID(),
            anchor: {
              sessionId: anchor.sessionId,
              messageId: anchor.messageId,
              seq: anchor.seq,
            },
            question,
          })
          if (!result.ok) throw commandError(result.error)
          if (!result.value.ok) throw commandError(result.value.error)
        },
        continueBranch: async ({ tail, question }) => {
          if (tail.branchId === null) throw new Error('Continue is not available on the main conversation.')
          const result = await ctx.remote.nestedFollowups.continueBranch({
            ownerSessionId: String(sessionId),
            clientRequestId: crypto.randomUUID(),
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
      }
    },
  }, ConversationTreeView))

  return disposeRemote
}
