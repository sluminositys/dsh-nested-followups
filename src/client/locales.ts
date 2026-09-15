import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

import type { TreeViewLabels } from './view/contracts.ts'

export const NS = 'nested-followups' as const

export type NestedFollowupsLocaleKey =
  | 'view.tree'
  | 'view.openTree'
  | 'view.returnToChat'
  | 'tree.canvas'
  | 'tree.search'
  | 'tree.searchPlaceholder'
  | 'tree.noSearchResults'
  | 'tree.independentContext'
  | 'tree.you'
  | 'tree.assistant'
  | 'tree.queued'
  | 'tree.streaming'
  | 'tree.complete'
  | 'tree.error'
  | 'tree.askFollowUp'
  | 'tree.askWaitForCompletion'
  | 'tree.askUnavailable'
  | 'tree.continueBranch'
  | 'tree.focus'
  | 'tree.clearFocus'
  | 'tree.collapse'
  | 'tree.expand'
  | 'tree.collapseAll'
  | 'tree.deleteBranch'
  | 'tree.details'
  | 'tree.close'
  | 'tree.zoomIn'
  | 'tree.zoomOut'
  | 'tree.fit'
  | 'tree.minimap'
  | 'tree.emptyTitle'
  | 'tree.emptyDescription'
  | 'tree.followUpPlaceholder'
  | 'tree.continuePlaceholder'
  | 'tree.quoteSelected'
  | 'tree.quoteHint'
  | 'tree.savedQuotes'
  | 'tree.saveQuote'
  | 'tree.removeQuote'
  | 'tree.quoteNotePlaceholder'

  | 'tree.quoteInvalid'
  | 'tree.snapToTurnTail'
  | 'tree.send'
  | 'tree.cancel'
  | 'tree.deleteTitle'
  | 'tree.deleteConfirm'
  | 'tree.deletePending'
  | 'tree.deleteArchiveNotice'
  | 'tree.askPending'
  | 'tree.continuePending'
  | 'tree.readonly'
  | 'tree.readonlyReason'
  | 'tree.nodeCount'
  | 'tree.collapsedCount'
  | 'tree.expandAnchorGroup'
  | 'tree.collapseAnchorGroup'
  | 'tree.expandBranchPath'
  | 'tree.collapseBranchPath'
  | 'tree.childBranchCount'
  | 'tree.deleteDescription'
  | 'tree.loading'
  | 'tree.loadFailed'
  | 'tree.retry'
  | 'context.title'
  | 'context.tab'
  | 'context.description'
  | 'context.inherited'
  | 'context.excluded'
  | 'context.summary'
  | 'context.noExclusions'
  | 'context.boundaryThrough'
  | 'context.showDetails'
  | 'context.revealMessage'
  | 'context.unavailable.userMessage'
  | 'context.unavailable.turnOpen'
  | 'context.unavailable.turnTailUnavailable'
  | 'context.excluded.rootSessionTail'
  | 'context.excluded.currentBranchTail'
  | 'context.excluded.siblingBranch'
  | 'context.excluded.descendantBranch'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'nested-followups': NestedFollowupsLocaleKey
  }
}

export const en: Record<NestedFollowupsLocaleKey, string> = {
  'view.tree': 'Tree View',
  'view.openTree': 'Open Tree View',
  'view.returnToChat': 'Return to Chat',
  'tree.canvas': 'Conversation tree',
  'tree.search': 'Search messages',
  'tree.searchPlaceholder': 'Search messages or node labels',
  'tree.noSearchResults': 'No matching messages',
  'tree.independentContext': 'Independent context',
  'tree.you': 'You',
  'tree.assistant': 'Assistant',
  'tree.queued': 'Queued',
  'tree.streaming': 'Streaming',
  'tree.complete': 'Complete',
  'tree.error': 'Failed',
  'tree.askFollowUp': 'Ask follow-up',
  'tree.askWaitForCompletion': 'Wait for this turn to finish before branching.',
  'tree.askUnavailable': 'This turn has no finalized assistant answer to branch from.',
  'tree.continueBranch': 'Continue this branch',
  'tree.focus': 'Focus',
  'tree.clearFocus': 'Clear focus',
  'tree.collapse': 'Collapse branch',
  'tree.expand': 'Expand branch',
  'tree.collapseAll': 'Collapse all',
  'tree.deleteBranch': 'Delete branch',
  'tree.details': 'Message details',
  'tree.close': 'Close',
  'tree.zoomIn': 'Zoom in',
  'tree.zoomOut': 'Zoom out',
  'tree.fit': 'Fit',
  'tree.minimap': 'Conversation tree minimap',
  'tree.emptyTitle': 'No messages yet',
  'tree.emptyDescription': 'Messages appear here after the conversation begins.',
  'tree.followUpPlaceholder': 'Ask a follow-up about this message…',
  'tree.continuePlaceholder': 'Add the next turn to this branch…',

  'tree.quoteSelected': 'Quoted source',
  'tree.quoteHint': 'To quote the answer, open the message and select the passage.',
  'tree.savedQuotes': 'Saved quotes',
  'tree.saveQuote': 'Save quote',
  'tree.removeQuote': 'Remove quote',
  'tree.quoteNotePlaceholder': 'Add an optional comment, Enter saves the quote',
  'tree.quoteInvalid': 'The quoted source changed; this branch now anchors to the whole message.',
  'tree.snapToTurnTail': 'Context will include the completed turn through {label}.',
  'tree.send': 'Send',
  'tree.cancel': 'Cancel',
  'tree.deleteTitle': 'Delete branch',
  'tree.deleteConfirm': 'Delete',
  'tree.deletePending': 'Deleting…',
  'tree.deleteArchiveNotice': 'The underlying branch sessions will be archived rather than physically deleted.',
  'tree.askPending': 'Sending…',
  'tree.continuePending': 'Continuing…',
  'tree.readonly': 'Tree View is read-only',
  'tree.readonlyReason': 'This Host cannot gate branch tool execution. Update DeepSeek Harness to create follow-up branches.',
  'tree.nodeCount': '{count} messages',
  'tree.collapsedCount': '+{count} messages',
  'tree.expandAnchorGroup': 'Expand {branches} branches · +{messages} messages',
  'tree.collapseAnchorGroup': 'Collapse whole group: {branches} branches · +{messages} messages',
  'tree.expandBranchPath': 'Expand branch {path}',
  'tree.collapseBranchPath': 'Collapse branch {path}',
  'tree.childBranchCount': '⑂×{count}',
  'tree.deleteDescription': 'This removes {branches} branches and {messages} messages. The root conversation and sibling branches are not changed.',
  'tree.loading': 'Loading conversation tree…',
  'tree.loadFailed': 'The conversation tree could not be loaded.',
  'tree.retry': 'Retry',
  'context.title': 'Context Preview',
  'context.tab': 'Context',
  'context.description': 'See which messages a new branch would inherit through the completed answer, and which messages stay outside it.',
  'context.inherited': 'Inherited messages',
  'context.excluded': 'Excluded messages',
  'context.summary': 'Inherited messages: {inherited}; excluded messages: {excluded}.',
  'context.noExclusions': 'No messages are excluded.',
  'context.boundaryThrough': 'Context is inherited through {label}.',
  'context.showDetails': 'View context details',
  'context.revealMessage': 'Show {label} in the tree',
  'context.unavailable.userMessage': 'Select the assistant answer from this turn to preview its context.',
  'context.unavailable.turnOpen': 'Wait for this turn to finish before previewing its context.',
  'context.unavailable.turnTailUnavailable': 'This turn has no completed assistant answer to use as a branch point.',
  'context.excluded.rootSessionTail': 'Main conversation messages after the branch point',
  'context.excluded.currentBranchTail': 'Later messages in this branch or its parent branches',
  'context.excluded.siblingBranch': 'Sibling branches',
  'context.excluded.descendantBranch': 'Nested branches outside the inherited path',
}

export const zh: Record<NestedFollowupsLocaleKey, string> = {
  'view.tree': '树状视图',
  'view.openTree': '打开树状视图',
  'view.returnToChat': '返回聊天',
  'tree.canvas': '会话树',
  'tree.search': '搜索消息',
  'tree.searchPlaceholder': '搜索消息内容或节点编号',
  'tree.noSearchResults': '没有匹配的消息',
  'tree.independentContext': '独立上下文',
  'tree.you': '你',
  'tree.assistant': '助手',
  'tree.queued': '等待中',
  'tree.streaming': '生成中',
  'tree.complete': '已完成',
  'tree.error': '失败',
  'tree.askFollowUp': '创建子分支',
  'tree.askWaitForCompletion': '请等待当前回合完成后再创建分支。',
  'tree.askUnavailable': '当前回合没有可用于创建分支的最终助手回答。',
  'tree.continueBranch': '继续当前分支',
  'tree.focus': '聚焦',
  'tree.clearFocus': '取消聚焦',
  'tree.collapse': '折叠分支',
  'tree.expand': '展开分支',
  'tree.collapseAll': '一键全收',
  'tree.deleteBranch': '删除分支',
  'tree.details': '消息详情',
  'tree.close': '关闭',
  'tree.zoomIn': '放大',
  'tree.zoomOut': '缩小',
  'tree.fit': '适应画布',
  'tree.minimap': '会话树小地图',
  'tree.emptyTitle': '暂无消息',
  'tree.emptyDescription': '会话开始后，消息会显示在这里。',
  'tree.followUpPlaceholder': '针对这条消息创建一个新的子分支…',
  'tree.continuePlaceholder': '向当前分支追加下一轮…',

  'tree.quoteSelected': '引用内容',
  'tree.quoteHint': '想引用回答内容？点开消息后用光标选中文字即可。',
  'tree.savedQuotes': '已保存的引用',
  'tree.saveQuote': '保存引用',
  'tree.removeQuote': '删除引用',
  'tree.quoteNotePlaceholder': '补充说明（可选），回车保存引用',
  'tree.quoteInvalid': '引用原文已发生变化；该分支现已降级为整条消息锚点。',
  'tree.snapToTurnTail': '上下文将继承到该回合结束（{label}）。',
  'tree.send': '发送',
  'tree.cancel': '取消',
  'tree.deleteTitle': '删除分支',
  'tree.deleteConfirm': '删除',
  'tree.deletePending': '正在删除…',
  'tree.deleteArchiveNotice': '底层分支会话将被归档，而不是物理删除。',
  'tree.askPending': '正在发送…',
  'tree.continuePending': '正在续聊…',
  'tree.readonly': '树状视图当前为只读',
  'tree.readonlyReason': '当前 Host 无法限制分支的工具执行。请升级 DeepSeek Harness 后再创建追问分支。',
  'tree.nodeCount': '{count} 条消息',
  'tree.collapsedCount': '+{count} 条消息',
  'tree.expandAnchorGroup': '展开 {branches} 条分支 · 共 +{messages} 条消息',
  'tree.collapseAnchorGroup': '收回整组：{branches} 条分支 · 共 +{messages} 条消息',
  'tree.expandBranchPath': '展开分支 {path}',
  'tree.collapseBranchPath': '折叠分支 {path}',
  'tree.childBranchCount': '⑂×{count}',
  'tree.deleteDescription': '这将删除 {branches} 条分支和 {messages} 条消息，不会改变主会话及兄弟分支。',
  'tree.loading': '正在加载会话树…',
  'tree.loadFailed': '无法加载会话树。',
  'tree.retry': '重试',
  'context.title': '上下文预览',
  'context.tab': '上下文',
  'context.description': '查看从这条完整回答创建分支时，会继承哪些消息，以及哪些消息不会带入新分支。',
  'context.inherited': '继承的消息',
  'context.excluded': '不带入的消息',
  'context.summary': '继承的消息：{inherited} 条；不带入的消息：{excluded} 条。',
  'context.noExclusions': '没有需要排除的消息。',
  'context.boundaryThrough': '上下文继承到 {label}。',
  'context.showDetails': '查看上下文详情',
  'context.revealMessage': '在树状视图中定位 {label}',
  'context.unavailable.userMessage': '请在这一轮的助手回答上查看上下文。',
  'context.unavailable.turnOpen': '这一轮尚未结束，请等待回答完成后再查看上下文。',
  'context.unavailable.turnTailUnavailable': '这一轮没有可作为分支起点的完整助手回答。',
  'context.excluded.rootSessionTail': '主会话中分支起点之后的消息',
  'context.excluded.currentBranchTail': '当前分支及上级分支中未继承的后续消息',
  'context.excluded.siblingBranch': '同级分支',
  'context.excluded.descendantBranch': '继承路径之外的更深层分支',
}

export function labelsFrom(t: TranslateNS<typeof NS>): TreeViewLabels {
  return {
    contextPreview: {
      title: t('context.title'),
      tab: t('context.tab'),
      description: t('context.description'),
      inherited: t('context.inherited'),
      excluded: t('context.excluded'),
      summary: (inherited, excluded) => t('context.summary', { inherited, excluded }),
      noExclusions: t('context.noExclusions'),
      boundaryThrough: label => t('context.boundaryThrough', { label }),
      showDetails: t('context.showDetails'),
      revealMessage: label => t('context.revealMessage', { label }),
      unavailableReasons: {
        'user-message': t('context.unavailable.userMessage'),
        'turn-open': t('context.unavailable.turnOpen'),
        'turn-tail-unavailable': t('context.unavailable.turnTailUnavailable'),
      },
      exclusionReasons: {
        'root-session-tail': t('context.excluded.rootSessionTail'),
        'current-branch-tail': t('context.excluded.currentBranchTail'),
        'sibling-branch': t('context.excluded.siblingBranch'),
        'descendant-branch': t('context.excluded.descendantBranch'),
      },
    },
    canvas: t('tree.canvas'),
    search: t('tree.search'),
    searchPlaceholder: t('tree.searchPlaceholder'),
    noSearchResults: t('tree.noSearchResults'),
    independentContext: t('tree.independentContext'),
    you: t('tree.you'),
    assistant: t('tree.assistant'),
    queued: t('tree.queued'),
    streaming: t('tree.streaming'),
    complete: t('tree.complete'),
    error: t('tree.error'),
    askFollowUp: t('tree.askFollowUp'),
    askWaitForCompletion: t('tree.askWaitForCompletion'),
    askUnavailable: t('tree.askUnavailable'),
    continueBranch: t('tree.continueBranch'),
    focus: t('tree.focus'),
    clearFocus: t('tree.clearFocus'),
    collapse: t('tree.collapse'),
    expand: t('tree.expand'),
    collapseAll: t('tree.collapseAll'),
    deleteBranch: t('tree.deleteBranch'),
    details: t('tree.details'),
    close: t('tree.close'),
    zoomIn: t('tree.zoomIn'),
    zoomOut: t('tree.zoomOut'),
    fit: t('tree.fit'),
    minimap: t('tree.minimap'),
    emptyTitle: t('tree.emptyTitle'),
    emptyDescription: t('tree.emptyDescription'),
    followUpPlaceholder: t('tree.followUpPlaceholder'),
    continuePlaceholder: t('tree.continuePlaceholder'),

    quoteSelected: t('tree.quoteSelected'),
    quoteHint: t('tree.quoteHint'),
    savedQuotes: t('tree.savedQuotes'),
    saveQuote: t('tree.saveQuote'),
    removeQuote: t('tree.removeQuote'),
    quoteNotePlaceholder: t('tree.quoteNotePlaceholder'),
    quoteInvalid: t('tree.quoteInvalid'),
    snapToTurnTail: label => t('tree.snapToTurnTail', { label }),
    send: t('tree.send'),
    cancel: t('tree.cancel'),
    deleteTitle: t('tree.deleteTitle'),
    deleteConfirm: t('tree.deleteConfirm'),
    deletePending: t('tree.deletePending'),
    deleteArchiveNotice: t('tree.deleteArchiveNotice'),
    askPending: t('tree.askPending'),
    continuePending: t('tree.continuePending'),
    readonly: t('tree.readonly'),
    nodeCount: count => t('tree.nodeCount', { count }),
    collapsedCount: count => t('tree.collapsedCount', { count }),
    expandAnchorGroup: (branches, messages) => t('tree.expandAnchorGroup', { branches, messages }),
    collapseAnchorGroup: (branches, messages) => t('tree.collapseAnchorGroup', { branches, messages }),
    expandBranchPath: path => t('tree.expandBranchPath', { path }),
    collapseBranchPath: path => t('tree.collapseBranchPath', { path }),
    childBranchCount: count => t('tree.childBranchCount', { count }),
    deleteDescription: (branches, messages) => t('tree.deleteDescription', { branches, messages }),
  }
}
