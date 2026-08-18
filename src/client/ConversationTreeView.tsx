import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

import { labelsFrom, NS } from './locales.ts'
import {
  mutationAcknowledged,
  projectOptimisticMutations,
  type OptimisticMutation,
} from './optimistic-projection.ts'
import type { TreeProjectionView } from './projection-controller.ts'
import { ConversationTreeCanvas } from './view/ConversationTreeCanvas.tsx'
import type { AskFollowUpRequest, ContinueBranchRequest, DeleteBranchRequest } from './view/contracts.ts'
import css from './view/ConversationTreeCanvas.module.css'

export interface ConversationTreeViewInjected {
  readonly hooks: { treeProjection: HostObservable<TreeProjectionView> }
  readonly ensure: () => Promise<boolean>
  readonly askFollowUp: (request: AskFollowUpRequest) => Promise<void>
  readonly continueBranch: (request: ContinueBranchRequest) => Promise<void>
  readonly deleteBranch: (request: DeleteBranchRequest) => Promise<void>
}

export type ConversationTreeViewProps =
  ConvViewProps
  & InjectFace<ConversationTreeViewInjected>
  & PropsLocale<typeof NS>

export function ConversationTreeView({
  useTreeProjection,
  ensure,
  askFollowUp,
  continueBranch,
  deleteBranch,
  t,
}: ConversationTreeViewProps) {
  const view = useTreeProjection(state => state)
  const [optimisticMutations, setOptimisticMutations] = useState<readonly OptimisticMutation[]>([])
  const labels = useMemo(() => labelsFrom(t), [t])
  useEffect(() => { void ensure() }, [ensure])
  const hostProjection = view.snapshot?.projection
  useEffect(() => {
    if (hostProjection === undefined) return
    setOptimisticMutations(current => {
      const pending = current.filter(mutation => !mutationAcknowledged(hostProjection, mutation))
      return pending.length === current.length ? current : pending
    })
  }, [hostProjection])
  const unresolvedOptimisticMutations = useMemo(
    () => hostProjection === undefined
      ? optimisticMutations
      : optimisticMutations.filter(mutation => !mutationAcknowledged(hostProjection, mutation)),
    [hostProjection, optimisticMutations],
  )
  const projection = useMemo(
    () => hostProjection === undefined
      ? undefined
      : projectOptimisticMutations(hostProjection, unresolvedOptimisticMutations),
    [hostProjection, unresolvedOptimisticMutations],
  )
  const removeOptimistic = useCallback((clientRequestId: string): void => {
    setOptimisticMutations(current => current.filter(
      mutation => mutation.clientRequestId !== clientRequestId,
    ))
  }, [])
  const submitFollowUp = useCallback(async (request: AskFollowUpRequest): Promise<void> => {
    setOptimisticMutations(current => [...current, {
      kind: 'branch',
      clientRequestId: request.clientRequestId,
      anchor: request.anchor,
      question: request.question,
      ...(request.anchorRange === undefined ? {} : { anchorRange: request.anchorRange }),
      createdAt: Date.now(),
    }])
    try {
      await askFollowUp(request)
    } catch (error: unknown) {
      removeOptimistic(request.clientRequestId)
      throw error
    }
  }, [askFollowUp, removeOptimistic])
  const submitContinuation = useCallback(async (request: ContinueBranchRequest): Promise<void> => {
    setOptimisticMutations(current => [...current, {
      kind: 'continue',
      clientRequestId: request.clientRequestId,
      tail: request.tail,
      question: request.question,
      createdAt: Date.now(),
    }])
    try {
      await continueBranch(request)
    } catch (error: unknown) {
      removeOptimistic(request.clientRequestId)
      throw error
    }
  }, [continueBranch, removeOptimistic])

  if (view.snapshot === null || projection === undefined) {
    return (
      <div className={css.viewStatus} role="status">
        <strong>{view.status === 'error' ? t('tree.loadFailed') : t('tree.loading')}</strong>
        {view.error !== null && <span>{view.error}</span>}
        {view.status === 'error' && (
          <Button size="sm" variant="outline" onClick={() => { void ensure() }}>
            {t('tree.retry')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <ConversationTreeCanvas
      projection={projection}
      labels={labels}
      {...view.snapshot.capabilities.askFollowUp
        && view.snapshot.capabilities.continueBranch
        ? {}
        : { readOnlyReason: t('tree.readonlyReason') }}
      {...view.snapshot.capabilities.askFollowUp ? { onAskFollowUp: submitFollowUp } : {}}
      {...view.snapshot.capabilities.continueBranch ? { onContinueBranch: submitContinuation } : {}}
      {...view.snapshot.capabilities.deletion.supported ? {
        onDeleteBranch: deleteBranch,
        deletionMode: view.snapshot.capabilities.deletion.mode,
      } : {}}
    />
  )
}
