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
  | 'tree.continueBranch'
  | 'tree.focus'
  | 'tree.clearFocus'
  | 'tree.collapse'
  | 'tree.expand'
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
  | 'tree.quoteSource'
  | 'tree.quoteSelected'
  | 'tree.clearQuote'
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
  | 'tree.deleteDescription'
  | 'tree.loading'
  | 'tree.loadFailed'
  | 'tree.retry'

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
  'tree.continueBranch': 'Continue this branch',
  'tree.focus': 'Focus',
  'tree.clearFocus': 'Clear focus',
  'tree.collapse': 'Collapse branch',
  'tree.expand': 'Expand branch',
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
  'tree.quoteSource': 'Select source text to quote (optional)',
  'tree.quoteSelected': 'Quoted source',
  'tree.clearQuote': 'Clear quote',
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
  'tree.readonlyReason': 'This Host cannot enforce the required chat-only branch boundary.',
  'tree.nodeCount': '{count} messages',
  'tree.collapsedCount': '+{count} nodes',
  'tree.deleteDescription': 'This removes {branches} branches and {messages} messages. The root conversation and sibling branches are not changed.',
  'tree.loading': 'Loading conversation tree…',
  'tree.loadFailed': 'The conversation tree could not be loaded.',
  'tree.retry': 'Retry',
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
  'tree.continueBranch': '继续当前分支',
  'tree.focus': '聚焦',
  'tree.clearFocus': '取消聚焦',
  'tree.collapse': '折叠分支',
  'tree.expand': '展开分支',
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
  'tree.quoteSource': '可选：在原始文本中选择要引用的内容',
  'tree.quoteSelected': '引用内容',
  'tree.clearQuote': '清除引用',
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
  'tree.readonlyReason': '当前 Host 无法强制实施所需的纯聊天分支边界。',
  'tree.nodeCount': '{count} 条消息',
  'tree.collapsedCount': '+{count} 个节点',
  'tree.deleteDescription': '这将删除 {branches} 条分支和 {messages} 条消息，不会改变主会话及兄弟分支。',
  'tree.loading': '正在加载会话树…',
  'tree.loadFailed': '无法加载会话树。',
  'tree.retry': '重试',
}

export function labelsFrom(t: TranslateNS<typeof NS>): TreeViewLabels {
  return {
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
    continueBranch: t('tree.continueBranch'),
    focus: t('tree.focus'),
    clearFocus: t('tree.clearFocus'),
    collapse: t('tree.collapse'),
    expand: t('tree.expand'),
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
    quoteSource: t('tree.quoteSource'),
    quoteSelected: t('tree.quoteSelected'),
    clearQuote: t('tree.clearQuote'),
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
    deleteDescription: (branches, messages) => t('tree.deleteDescription', { branches, messages }),
  }
}
