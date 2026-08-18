import { useEffect, useMemo } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

import { labelsFrom, NS } from './locales.ts'
import type { TreeProjectionView } from './projection-controller.ts'
import { ConversationTreeCanvas } from './view/ConversationTreeCanvas.tsx'
import type { AskFollowUpRequest, ContinueBranchRequest } from './view/contracts.ts'
import css from './view/ConversationTreeCanvas.module.css'

export interface ConversationTreeViewInjected {
  readonly hooks: { treeProjection: HostObservable<TreeProjectionView> }
  readonly ensure: () => Promise<boolean>
  readonly askFollowUp: (request: AskFollowUpRequest) => Promise<void>
  readonly continueBranch: (request: ContinueBranchRequest) => Promise<void>
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
  t,
}: ConversationTreeViewProps) {
  const view = useTreeProjection(state => state)
  const labels = useMemo(() => labelsFrom(t), [t])
  useEffect(() => { void ensure() }, [ensure])

  if (view.snapshot === null) {
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
      projection={view.snapshot.projection}
      labels={labels}
      {...view.snapshot.capabilities.askFollowUp
        && view.snapshot.capabilities.continueBranch
        ? {}
        : { readOnlyReason: t('tree.readonlyReason') }}
      {...view.snapshot.capabilities.askFollowUp ? { onAskFollowUp: askFollowUp } : {}}
      {...view.snapshot.capabilities.continueBranch ? { onContinueBranch: continueBranch } : {}}
    />
  )
}
