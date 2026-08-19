import type { ReactNode } from 'react'
import type { ChatStore } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  Button,
  IconBranchOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'

import { NS } from './locales.ts'
import { CHAT_VIEW_ID, TREE_VIEW_ID } from './view-ids.ts'
import css from './TreeViewHeaderAction.module.css'

export type TreeViewHeaderActionProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & PropsStore<ChatStore>
  & PropsLocale<typeof NS>

/** Switch between the native Chat view and this plugin's Tree View. */
export function TreeViewHeaderAction({
  useStore,
  actions,
  t,
}: TreeViewHeaderActionProps): ReactNode {
  const treeActive = useStore(state => state.view === TREE_VIEW_ID)
  const actionLabel = treeActive ? t('view.returnToChat') : t('view.openTree')

  return (
    <Tooltip label={actionLabel} side="bottom">
      <Button
        variant="outline"
        size="sm"
        className={css.toggle}
        icon={<IconBranchOutline16 />}
        aria-label={actionLabel}
        aria-pressed={treeActive}
        onClick={() => { actions.setView(treeActive ? CHAT_VIEW_ID : TREE_VIEW_ID) }}
      >
        {t('view.tree')}
      </Button>
    </Tooltip>
  )
}

