import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  IconChevronUpOutline14,
  IconCloseOutline16,
  IconSearchOutline16,
  MarkdownText,
  MessageText,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  composeQuotedQuestion,
  locateQuoteRange,
  type SavedQuote,
} from '../../shared/anchored-question.ts'
import { displayLabelOf } from '../../shared/labels.ts'
import type { AnchorRange, MessageNodeView } from '../../shared/types.ts'
import {
  centerOf,
  type Point,
  type Size,
} from '../tree/geometry.ts'
import { layoutConversationTree, type BranchCapsuleLayout } from '../tree/layout.ts'
import {
  createMinimapModel,
  navigateFromMinimap,
} from '../tree/minimap.ts'
import {
  childAnchorDotIdsForBranch,
  deepExpansionTargetsForAnchor,
  deepExpansionTargetsForBranch,
  deriveFocusState,
  searchTreeNodes,
  topLevelAnchorDotIds,
} from '../tree/navigation.ts'
import {
  centerViewportOn,
  fitViewport,
  isWorldRectVisible,
  panViewport,
  zoomViewportAt,
  type ViewportTransform,
} from '../tree/viewport.ts'
import {
  DEFAULT_TREE_VIEW_LABELS,
  type ConversationTreeCanvasProps,
  type DeleteBranchRequest,
  type TreeViewLabels,
} from './contracts.ts'
import { MessageNodeCard } from './MessageNodeCard.tsx'
import {
  branchDeleteImpact,
  createTreeInteractionState,
  loadTreeViewState,
  saveTreeViewState,
  toTreeViewState,
  treeInteractionReducer,
} from './state.ts'
import { TreeMinimap } from './TreeMinimap.tsx'
import css from './ConversationTreeCanvas.module.css'

const MINIMAP_SIZE: Size = { width: 190, height: 128 }

interface PointerPan {
  readonly pointerId: number
  readonly point: Point
}

interface ExitingCapsule {
  readonly capsule: BranchCapsuleLayout
  readonly reverseIndex: number
}

interface ExitingCard {
  readonly node: MessageNodeView
  readonly rect: { x: number; y: number; width: number; height: number }
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const measure = (): void => {
      const bounds = element.getBoundingClientRect()
      setSize({ width: bounds.width, height: bounds.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => { window.removeEventListener('resize', measure) }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [ref])
  return size
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatTime(value: number, formatter: Intl.DateTimeFormat): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : formatter.format(date)
}

function canPanFrom(target: EventTarget | null): boolean {
  return !(target instanceof Element)
    || target.closest(
      'button, input, textarea, [data-tree-interactive], [data-tree-scroll], [role="treeitem"]',
    ) === null
}

function branchFirstNodeIds(
  branches: ConversationTreeCanvasProps['projection']['branches'],
): ReadonlySet<string> {
  return new Set(branches.flatMap(branch => branch.nodeIds[0] === undefined ? [] : [branch.nodeIds[0]]))
}

/** DOM textarea offsets and persisted Markdown offsets are both UTF-16 code units. */
export function anchorRangeFromSelection(
  text: string,
  start: number,
  end: number,
): AnchorRange | undefined {
  if (!Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || start >= end
    || end > text.length) return undefined
  return { start, end, text: text.slice(start, end) }
}

export function deletionConfirmationDescription(
  labels: TreeViewLabels,
  impact: { readonly branchCount: number; readonly messageCount: number },
  mode: 'delete' | 'archive',
): string {
  return [
    labels.deleteDescription(impact.branchCount, impact.messageCount),
    mode === 'archive' ? labels.deleteArchiveNotice : '',
  ].filter(Boolean).join(' ')
}

function nodeStyle(rect: { x: number; y: number; width: number; height: number }): React.CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
}

interface PendingQuoteCapture {
  readonly text: string
  readonly left: number
  readonly top: number
}

function MessageDetails({
  node,
  labels,
  quote,
  quoteInvalid,
  savedQuotes,
  onAddQuote,
  onRemoveQuote,
  onClose,
}: {
  readonly node: MessageNodeView
  readonly labels: TreeViewLabels
  readonly quote?: string
  readonly quoteInvalid: boolean
  readonly savedQuotes: readonly SavedQuote[]
  readonly onAddQuote: (text: string, note: string) => void
  readonly onRemoveQuote: (quoteId: string) => void
  readonly onClose: () => void
}) {
  const [capture, setCapture] = useState<PendingQuoteCapture | null>(null)
  const [note, setNote] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  const beginCapture = (): void => {
    const selection = typeof window === 'undefined' ? null : window.getSelection()
    const content = contentRef.current
    if (selection === null || content === null || selection.rangeCount === 0) return
    const text = selection.toString().trim()
    if (text === '' || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    if (!content.contains(range.commonAncestorContainer)) return
    const rect = range.getBoundingClientRect()
    setNote('')
    setCapture({ text, left: rect.left + rect.width / 2, top: rect.bottom + 8 })
  }
  const saveCapture = (): void => {
    if (capture === null) return
    onAddQuote(capture.text, note)
    setCapture(null)
    setNote('')
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges()
  }

  return (
    <aside className={css.detailsDrawer} data-tree-scroll="true" aria-label={labels.details}>
      <header className={css.detailsHeader}>
        <span className={css.detailsTitle}>{displayLabelOf(node)} · {node.role === 'user' ? labels.you : labels.assistant}</span>
        <button type="button" className={css.iconButton} aria-label={labels.close} onClick={onClose}>
          <IconCloseOutline16 size={14} />
        </button>
      </header>
      {savedQuotes.length > 0 && (
        <ul className={css.savedQuoteList} aria-label={labels.savedQuotes}>
          {savedQuotes.map((saved, index) => (
            <li key={saved.id} className={css.savedQuoteChip}>
              <span className={css.savedQuoteText} title={saved.text}>
                {index + 1}. {saved.text}
              </span>
              {saved.note !== '' && <span className={css.savedQuoteNote}>{saved.note}</span>}
              <button
                type="button"
                className={css.savedQuoteRemove}
                aria-label={labels.removeQuote}
                onClick={() => { onRemoveQuote(saved.id) }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        ref={contentRef}
        className={css.detailsContent}
        onMouseUp={beginCapture}
      >
        {quote !== undefined && (
          <blockquote className={css.anchorQuote} aria-label={labels.quoteSelected}>{quote}</blockquote>
        )}
        {quoteInvalid && <p className={css.invalidQuote} role="status">{labels.quoteInvalid}</p>}
        {node.role === 'assistant'
          ? <MarkdownText text={node.text} streaming={node.state === 'streaming'} />
          : <MessageText text={node.text} />}
      </div>
      {capture !== null && typeof document !== 'undefined' && createPortal(
        <div
          className={css.quoteCapture}
          style={{ left: capture.left, top: capture.top }}
          role="dialog"
          aria-label={labels.saveQuote}
        >
          <blockquote className={css.quoteCaptureText}>{capture.text}</blockquote>
          <input
            autoFocus
            className={css.quoteCaptureInput}
            value={note}
            placeholder={labels.quoteNotePlaceholder}
            aria-label={labels.quoteNotePlaceholder}
            onChange={event => { setNote(event.target.value) }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') {
                event.preventDefault()
                saveCapture()
              }
              if (event.key === 'Escape') setCapture(null)
            }}
          />
          <div className={css.quoteCaptureActions}>
            <button type="button" onClick={() => { setCapture(null) }}>{labels.cancel}</button>
            <button type="button" data-primary="true" onClick={saveCapture}>{labels.saveQuote}</button>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  )
}

function FollowUpComposer({
  node,
  mode,
  labels,
  branchTargetLabel,
  savedQuotes,
  onRemoveQuote,
  style,
  submit,
  close,
}: {
  readonly node: MessageNodeView
  readonly mode: 'ask' | 'continue'
  readonly labels: TreeViewLabels
  readonly branchTargetLabel?: string
  readonly savedQuotes: readonly SavedQuote[]
  readonly onRemoveQuote: (quoteId: string) => void
  readonly style: React.CSSProperties
  readonly submit: (
    text: string,
    clientRequestId: string,
    anchorRange?: AnchorRange,
  ) => Promise<void>
  readonly close: () => void
}) {
  const [draft, setDraft] = useState('')
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const quotes = mode === 'ask' ? savedQuotes : []
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const typed = draft.trim()
    if (typed === '' || pending) return
    // The first pure quote becomes the durable anchor when it matches the
    // source exactly once; the Host prepends that quote block itself. Every
    // other quote, and any quote carrying a note, travels inline.
    const headRange = quotes.length > 0 && quotes[0]!.note.trim() === ''
      ? locateQuoteRange(node.text, quotes[0]!.text)
      : undefined
    const question = composeQuotedQuestion(quotes, typed, headRange !== undefined)
    setPending(true)
    setFailure(null)
    void submit(question, clientRequestId, headRange).then(() => {
      setPending(false)
      close()
    }, (error: unknown) => {
      setPending(false)
      setFailure(errorMessage(error))
    })
  }
  return (
    <form
      className={css.followUpComposer}
      style={style}
      data-tree-interactive="true"
      data-mode={mode}
      aria-label={`${mode === 'ask' ? labels.askFollowUp : labels.continueBranch}: ${displayLabelOf(node)}`}
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) close()
      }}
    >
      {mode === 'ask' && branchTargetLabel !== undefined && (
        <p className={css.snapNotice} role="status">{labels.snapToTurnTail(branchTargetLabel)}</p>
      )}
      {quotes.length > 0 && (
        <div className={css.selectedQuote} data-tree-scroll="true">
          <span>{labels.quoteSelected}</span>
          {quotes.map(saved => (
            <div key={saved.id} className={css.composerQuoteRow}>
              <blockquote>{saved.text}</blockquote>
              {saved.note !== '' && <p className={css.savedQuoteNote}>{saved.note}</p>}
              <button
                type="button"
                className={css.clearQuote}
                disabled={pending}
                aria-label={labels.removeQuote}
                onClick={() => { onRemoveQuote(saved.id) }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {mode === 'ask' && quotes.length === 0 && (
        <p className={css.quoteHint}>{labels.quoteHint}</p>
      )}
      <textarea
        autoFocus
        className={css.followUpInput}
        rows={3}
        value={draft}
        disabled={pending}
        placeholder={mode === 'ask' ? labels.followUpPlaceholder : labels.continuePlaceholder}
        aria-label={mode === 'ask' ? labels.followUpPlaceholder : labels.continuePlaceholder}
        onChange={event => { setDraft(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}
      />
      {failure !== null && <p className={css.inlineError} role="alert">{failure}</p>}
      <div className={css.composerActions}>
        <Button size="sm" variant="ghost" disabled={pending} onClick={close}>{labels.cancel}</Button>
        <Button size="sm" variant="primary" disabled={pending || draft.trim() === ''} type="submit">
          {pending
            ? (mode === 'ask' ? labels.askPending : labels.continuePending)
            : (mode === 'ask' ? labels.askFollowUp : labels.continueBranch)}
        </Button>
      </div>
    </form>
  )
}

export function ConversationTreeCanvas({
  projection,
  labels = DEFAULT_TREE_VIEW_LABELS,
  readOnlyReason,
  onAskFollowUp,
  onContinueBranch,
  onDeleteBranch,
  deletionMode = 'delete',
}: ConversationTreeCanvasProps) {
  const [initialViewState] = useState(() => loadTreeViewState(projection.tree.treeId))
  const [interaction, dispatch] = useReducer(
    treeInteractionReducer,
    initialViewState,
    state => createTreeInteractionState(state, projection.tree.treeId),
  )
  const [transform, setTransform] = useState<ViewportTransform>(
    initialViewState?.viewport ?? { x: 0, y: 0, zoom: 1 },
  )
  const [panning, setPanning] = useState(false)
  const [deleteRequest, setDeleteRequest] = useState<DeleteBranchRequest | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null)
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null)
  const [ripplingAnchorId, setRipplingAnchorId] = useState<string | null>(null)
  const [exitingCapsules, setExitingCapsules] = useState<readonly ExitingCapsule[]>([])
  const [exitingCards, setExitingCards] = useState<readonly ExitingCard[]>([])
  const [expandingCapsule, setExpandingCapsule] = useState<BranchCapsuleLayout | null>(null)
  const [collapsingToCapsuleIds, setCollapsingToCapsuleIds] = useState<ReadonlySet<string>>(
    new Set(),
  )
  const [quotesByNodeId, setQuotesByNodeId] = useState<ReadonlyMap<string, readonly SavedQuote[]>>(
    new Map(),
  )
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerPanRef = useRef<PointerPan | null>(null)
  const fittedTreeRef = useRef<string | null>(
    initialViewState === undefined ? null : projection.tree.treeId,
  )
  const autoFollowStreamingRef = useRef(true)
  const followedLiveNodeIdRef = useRef<string | null>(null)
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const capsuleExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const capsuleMorphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportSize = useElementSize(viewportRef)
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    [],
  )

  useEffect(() => {
    if (interaction.treeId === projection.tree.treeId) return
    const viewState = loadTreeViewState(projection.tree.treeId)
    dispatch({
      type: 'view/restore',
      treeId: projection.tree.treeId,
      ...(viewState === undefined ? {} : { viewState }),
    })
    setTransform(viewState?.viewport ?? { x: 0, y: 0, zoom: 1 })
    fittedTreeRef.current = viewState === undefined ? null : projection.tree.treeId
  }, [interaction.treeId, projection.tree.treeId])

  useEffect(() => {
    if (interaction.treeId !== projection.tree.treeId) return
    dispatch({ type: 'projection/reconcile', projection })
  }, [interaction.treeId, projection])

  // First visit to a tree with no stored ViewState starts fully folded: the
  // trunk plus one dot per top-level anchor group, revealed level by level.
  // Folding is derived during render so the first frame is already folded,
  // then committed once so later interactions behave normally.
  const [needsInitialFold, setNeedsInitialFold] = useState(() => initialViewState === undefined)
  useEffect(() => {
    if (interaction.treeId === projection.tree.treeId) return
    setNeedsInitialFold(loadTreeViewState(projection.tree.treeId) === undefined)
  }, [interaction.treeId, projection.tree.treeId])
  useEffect(() => {
    if (!needsInitialFold || interaction.treeId !== projection.tree.treeId) return
    const anchorDotIds = topLevelAnchorDotIds(projection)
    if (anchorDotIds.length === 0) return
    setNeedsInitialFold(false)
    dispatch({ type: 'anchors/collapse-all', anchorDotIds })
  }, [interaction.treeId, needsInitialFold, projection])

  useEffect(() => {
    if (interaction.treeId !== projection.tree.treeId) return
    saveTreeViewState(toTreeViewState(interaction, transform))
  }, [interaction, projection.tree.treeId, transform])

  useEffect(() => () => {
    if (rippleTimerRef.current !== null) clearTimeout(rippleTimerRef.current)
    if (capsuleExitTimerRef.current !== null) clearTimeout(capsuleExitTimerRef.current)
    if (cardExitTimerRef.current !== null) clearTimeout(cardExitTimerRef.current)
    if (capsuleMorphTimerRef.current !== null) clearTimeout(capsuleMorphTimerRef.current)
  }, [])

  const layout = useMemo(() => {
    const anchorDotIds = needsInitialFold
      ? new Set([...interaction.anchorDotIds, ...topLevelAnchorDotIds(projection)])
      : interaction.anchorDotIds
    return layoutConversationTree(projection, {
      collapsedBranchIds: interaction.collapsedBranchIds,
      anchorDotIds,
    })
  }, [interaction.anchorDotIds, interaction.collapsedBranchIds, needsInitialFold, projection])
  const focus = useMemo(
    () => deriveFocusState(projection, interaction.focusedNodeId),
    [interaction.focusedNodeId, projection],
  )
  const nodes = useMemo(
    () => new Map(projection.nodes.map(node => [node.nodeId, node] as const)),
    [projection.nodes],
  )
  const nodesBySessionMessage = useMemo(
    () => new Map(projection.nodes.map(node => [
      `${node.sessionId}\u0000${node.messageId}`,
      node,
    ] as const)),
    [projection.nodes],
  )
  const branches = useMemo(
    () => new Map(projection.branches.map(branch => [branch.record.branchId, branch] as const)),
    [projection.branches],
  )
  const branchRegions = useMemo(
    () => new Map(layout.branchRegions.map(region => [region.branchId, region] as const)),
    [layout.branchRegions],
  )
  const branchCapsules = useMemo(
    () => new Map(layout.branchCapsules.map(capsule => [capsule.branchId, capsule] as const)),
    [layout.branchCapsules],
  )
  const firstNodeIds = useMemo(() => branchFirstNodeIds(projection.branches), [projection.branches])
  const branchTailNodeIds = useMemo(
    () => new Set(projection.branches.flatMap(branch => {
      const tail = branch.nodeIds.at(-1)
      return tail === undefined ? [] : [tail]
    })),
    [projection.branches],
  )
  const rootAnchorDotIds = useMemo(() => topLevelAnchorDotIds(projection), [projection])
  const searchResults = useMemo(
    () => searchTreeNodes(projection, interaction.searchQuery, 12),
    [interaction.searchQuery, projection],
  )

  useEffect(() => {
    if (interaction.treeId !== projection.tree.treeId) return
    if (projection.nodes.length === 0 || viewportSize.width <= 0 || viewportSize.height <= 0) return
    if (fittedTreeRef.current === projection.tree.treeId) return
    fittedTreeRef.current = projection.tree.treeId
    setTransform(fitViewport(layout.bounds, viewportSize))
  }, [interaction.treeId, layout.bounds, projection.nodes.length, projection.tree.treeId, viewportSize])

  useEffect(() => {
    if (pendingCenterNodeId === null || viewportSize.width <= 0 || viewportSize.height <= 0) return
    const target = layout.nodes.find(node => node.nodeId === pendingCenterNodeId)
    if (target === undefined) return
    setTransform(current => centerViewportOn(current, viewportSize, centerOf(target.rect)))
    setPendingCenterNodeId(null)
  }, [layout.nodes, pendingCenterNodeId, viewportSize])

  const worldWidth = Math.max(
    layout.bounds.x + layout.bounds.width + layout.options.canvasPadding,
    viewportSize.width / transform.zoom,
  )
  const worldHeight = Math.max(
    layout.bounds.y + layout.bounds.height + layout.options.canvasPadding,
    viewportSize.height / transform.zoom,
  )
  const minimap = useMemo(
    () => createMinimapModel(layout, transform, viewportSize, MINIMAP_SIZE),
    [layout, transform, viewportSize],
  )

  const noteManualViewportChange = useCallback(() => {
    autoFollowStreamingRef.current = false
  }, [])
  const beginStreamFollow = useCallback(() => {
    autoFollowStreamingRef.current = true
    followedLiveNodeIdRef.current = null
  }, [])

  useEffect(() => {
    autoFollowStreamingRef.current = true
    followedLiveNodeIdRef.current = null
  }, [projection.tree.treeId])

  useEffect(() => {
    const liveNode = projection.nodes
      .filter(node => node.state === 'queued' || node.state === 'streaming')
      .reduce<MessageNodeView | undefined>((latest, candidate) => {
        if (latest === undefined) return candidate
        return candidate.time > latest.time
          || (candidate.time === latest.time && candidate.seq > latest.seq)
          ? candidate
          : latest
      }, undefined)
    if (liveNode === undefined) {
      followedLiveNodeIdRef.current = null
      return
    }
    if (!autoFollowStreamingRef.current
      || followedLiveNodeIdRef.current === liveNode.nodeId
      || viewportSize.width <= 0
      || viewportSize.height <= 0) return
    const position = layout.nodes.find(node => node.nodeId === liveNode.nodeId)
    if (position === undefined) return
    followedLiveNodeIdRef.current = liveNode.nodeId
    if (!isWorldRectVisible(position.rect, transform, viewportSize)) {
      setTransform(current => centerViewportOn(current, viewportSize, centerOf(position.rect)))
    }
  }, [layout.nodes, projection.nodes, transform, viewportSize])

  const zoomAtCenter = useCallback((factor: number) => {
    noteManualViewportChange()
    setTransform(current => zoomViewportAt(
      current,
      { x: viewportSize.width / 2, y: viewportSize.height / 2 },
      current.zoom * factor,
    ))
  }, [noteManualViewportChange, viewportSize])

  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (!canPanFrom(event.target)) return
    noteManualViewportChange()
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const factor = Math.exp(-event.deltaY * 0.0015)
    setTransform(current => zoomViewportAt(current, point, current.zoom * factor))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !canPanFrom(event.target)) return
    noteManualViewportChange()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerPanRef.current = {
      pointerId: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
    }
    setPanning(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const previous = pointerPanRef.current
    if (previous === null || previous.pointerId !== event.pointerId) return
    const point = { x: event.clientX, y: event.clientY }
    setTransform(current => panViewport(current, {
      x: point.x - previous.point.x,
      y: point.y - previous.point.y,
    }))
    pointerPanRef.current = { pointerId: event.pointerId, point }
  }
  const stopPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (pointerPanRef.current?.pointerId !== event.pointerId) return
    pointerPanRef.current = null
    setPanning(false)
  }

  const selectedDetails = interaction.selectedNodeId === undefined
    || !interaction.expandedNodeIds.has(interaction.selectedNodeId)
    ? undefined
    : nodes.get(interaction.selectedNodeId)
  const composerNode = interaction.composerNodeId === undefined
    ? undefined
    : nodes.get(interaction.composerNodeId)
  const composerLayout = interaction.composerNodeId === undefined
    ? undefined
    : layout.nodes.find(node => node.nodeId === interaction.composerNodeId)
  const composerMode = interaction.composerMode
  const composerTargetNode = composerNode?.branchTargetMessageId === undefined
    ? undefined
    : nodesBySessionMessage.get(`${composerNode.sessionId}\u0000${composerNode.branchTargetMessageId}`)
  const selectedDetailsBranch = selectedDetails?.branchId === null
    || selectedDetails?.branchId === undefined
    ? undefined
    : branches.get(selectedDetails.branchId)
  const selectedDetailsIsBranchFirst = selectedDetails !== undefined
    && selectedDetailsBranch?.nodeIds[0] === selectedDetails.nodeId

  const selectNode = (nodeId: string): void => {
    noteManualViewportChange()
    const alreadyOpen = interaction.selectedNodeId === nodeId && interaction.expandedNodeIds.has(nodeId)
    if (alreadyOpen) {
      dispatch({ type: 'node/toggle-expanded', nodeId })
      dispatch({ type: 'selection/set', nodeId: undefined })
      return
    }
    if (!interaction.expandedNodeIds.has(nodeId)) {
      dispatch({ type: 'node/toggle-expanded', nodeId })
    }
    dispatch({ type: 'selection/set', nodeId })
  }

  const confirmDelete = (): void => {
    if (deleteRequest === null || onDeleteBranch === undefined) return
    setDeletePending(true)
    setDeleteFailure(null)
    void onDeleteBranch(deleteRequest).then(() => {
      setDeletePending(false)
      setDeleteRequest(null)
    }, (error: unknown) => {
      setDeletePending(false)
      setDeleteFailure(errorMessage(error))
    })
  }

  const requestBranchDelete = (branchId: string): void => {
    const impact = branchDeleteImpact(projection, branchId)
    setDeleteRequest({ branchId, ...impact })
  }

  const addQuote = (nodeId: string, text: string, note: string): void => {
    setQuotesByNodeId((current) => {
      const next = new Map(current)
      const existing = next.get(nodeId) ?? []
      next.set(nodeId, [...existing, { id: crypto.randomUUID(), text, note: note.trim() }])
      return next
    })
  }
  const removeQuote = (nodeId: string, quoteId: string): void => {
    setQuotesByNodeId((current) => {
      const next = new Map(current)
      const remaining = (next.get(nodeId) ?? []).filter(saved => saved.id !== quoteId)
      if (remaining.length === 0) next.delete(nodeId)
      else next.set(nodeId, remaining)
      return next
    })
  }
  const clearQuotes = (nodeId: string): void => {
    setQuotesByNodeId((current) => {
      if (!current.has(nodeId)) return current
      const next = new Map(current)
      next.delete(nodeId)
      return next
    })
  }

  const activityLabel = (activity: 'running' | 'error' | 'complete'): string => {
    if (activity === 'running') return labels.streaming
    if (activity === 'error') return labels.error
    return labels.complete
  }

  const triggerAnchorRipple = (anchorDotId: string): void => {
    if (rippleTimerRef.current !== null) clearTimeout(rippleTimerRef.current)
    setRipplingAnchorId(anchorDotId)
    rippleTimerRef.current = setTimeout(() => {
      setRipplingAnchorId(null)
      rippleTimerRef.current = null
    }, 450)
  }

  const startCapsuleExit = (anchorDotIds: readonly string[]): void => {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    const targets = new Set(anchorDotIds)
    const capsules = layout.branchCapsules.filter(capsule => targets.has(capsule.anchorDotId))
    if (capsules.length === 0) return
    if (capsuleExitTimerRef.current !== null) clearTimeout(capsuleExitTimerRef.current)
    setExitingCapsules(capsules.map((capsule, index) => ({
      capsule,
      reverseIndex: capsules.length - index - 1,
    })))
    capsuleExitTimerRef.current = setTimeout(() => {
      setExitingCapsules([])
      capsuleExitTimerRef.current = null
    }, 260)
  }

  const startCardExit = (branchIds: readonly string[], toCapsule = false): void => {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    const subtreeBranchIds = new Set(branchIds.flatMap(branchId =>
      deepExpansionTargetsForBranch(projection, branchId).branchIds))
    const cards = layout.nodes.flatMap((position): ExitingCard[] => {
      if (position.branchId === null || !subtreeBranchIds.has(position.branchId)) return []
      const node = nodes.get(position.nodeId)
      return node === undefined ? [] : [{ node, rect: position.rect }]
    })
    if (cards.length === 0) return
    if (cardExitTimerRef.current !== null) clearTimeout(cardExitTimerRef.current)
    setExitingCards(cards)
    setCollapsingToCapsuleIds(toCapsule ? new Set(branchIds) : new Set())
    cardExitTimerRef.current = setTimeout(() => {
      setExitingCards([])
      setCollapsingToCapsuleIds(new Set())
      cardExitTimerRef.current = null
    }, 200)
  }

  const startCapsuleMorph = (capsule: BranchCapsuleLayout): void => {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    if (capsuleMorphTimerRef.current !== null) clearTimeout(capsuleMorphTimerRef.current)
    setExpandingCapsule(capsule)
    capsuleMorphTimerRef.current = setTimeout(() => {
      setExpandingCapsule(null)
      capsuleMorphTimerRef.current = null
    }, 160)
  }

  return (
    <section className={css.root} aria-label={labels.canvas}>
      <div className={css.toolbar}>
        <div className={css.searchWrap}>
          <IconSearchOutline16 size={14} className={css.searchIcon} />
          <input
            className={css.searchInput}
            type="search"
            aria-label={labels.search}
            placeholder={labels.searchPlaceholder}
            value={interaction.searchQuery}
            onChange={event => {
              noteManualViewportChange()
              dispatch({ type: 'search/set', query: event.target.value })
            }}
          />
          {interaction.searchQuery.trim() !== '' && (
            <div className={css.searchResults} role="listbox" aria-label={labels.search}>
              {searchResults.length === 0 && <p className={css.searchEmpty}>{labels.noSearchResults}</p>}
              {searchResults.map(result => (
                <button
                  key={result.nodeId}
                  type="button"
                  className={css.searchResult}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    noteManualViewportChange()
                    dispatch({
                      type: 'search/select',
                      nodeId: result.nodeId,
                      branchesToExpand: result.branchesToExpand,
                      anchorDotsToExpand: result.anchorDotsToExpand,
                    })
                    setPendingCenterNodeId(result.nodeId)
                  }}
                >
                  <strong>{result.label}</strong>
                  <span>{result.role === 'user' ? labels.you : labels.assistant}</span>
                  <small>{result.summary}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        {rootAnchorDotIds.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              noteManualViewportChange()
              startCapsuleExit(rootAnchorDotIds)
              startCardExit(layout.anchorControls
                .filter(control => control.depth === 1 && control.open)
                .flatMap(control => control.branchIds))
              dispatch({ type: 'anchors/collapse-all', anchorDotIds: rootAnchorDotIds })
            }}
          >
            {labels.collapseAll}
          </Button>
        )}
        <span className={css.nodeTotal}>{labels.nodeCount(projection.nodes.length)}</span>
        {focus.active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              noteManualViewportChange()
              dispatch({ type: 'focus/set', nodeId: undefined })
            }}
          >
            {labels.clearFocus}
          </Button>
        )}
      </div>
      {readOnlyReason !== undefined && (
        <div className={css.readOnlyBanner} role="status">
          <strong>{labels.readonly}</strong>
          <span>{readOnlyReason}</span>
        </div>
      )}
      <div
        ref={viewportRef}
        className={css.viewport}
        role="tree"
        aria-label={labels.canvas}
        data-panning={panning || undefined}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
      >
        {projection.nodes.length === 0
          ? (
            <div className={css.emptyState}>
              <strong>{labels.emptyTitle}</strong>
              <span>{labels.emptyDescription}</span>
            </div>
          )
          : (
            <div
              className={css.world}
              style={{
                width: worldWidth,
                height: worldHeight,
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
              }}
              aria-hidden={false}
            >
              <svg className={css.graph} width={worldWidth} height={worldHeight} aria-hidden="true">
                {layout.edges.map(edge => (
                  <path
                    key={edge.edgeId}
                    className={css.edge}
                    data-kind={edge.kind}
                    data-dimmed={focus.dimmedEdgeIds.has(edge.edgeId) || undefined}
                    d={edge.path}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {layout.anchorControls.map(control => (
                  <path
                    key={`anchor-control-edge:${control.anchorDotId}`}
                    className={css.edge}
                    data-kind="branch"
                    d={control.path}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {layout.branchCapsules.map(capsule => (
                  <path
                    key={`capsule-edge:${capsule.branchId}`}
                    className={`${css.edge} ${css.capsuleEdge}`}
                    data-kind="branch"
                    d={capsule.path}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {layout.nodes.map(position => {
                const node = nodes.get(position.nodeId)
                if (node === undefined) return null
                const branch = node.branchId === null ? undefined : branches.get(node.branchId)
                const branchTargetNode = node.branchTargetMessageId === undefined
                  ? undefined
                  : nodesBySessionMessage.get(`${node.sessionId}\u0000${node.branchTargetMessageId}`)
                const firstInBranch = firstNodeIds.has(node.nodeId)
                const focused = interaction.focusedNodeId === node.nodeId
                const quote = firstInBranch && branch?.anchorStatus === 'range-valid'
                  ? branch.record.anchorRange?.text
                  : undefined
                const quoteInvalid = firstInBranch && branch?.anchorStatus === 'range-invalid'
                const nodeSettled = node.state === 'complete' || node.state === 'error'
                const branchTargetSettled = branchTargetNode !== undefined
                  && (branchTargetNode.state === 'complete' || branchTargetNode.state === 'error')
                const canAsk = readOnlyReason === undefined
                  && onAskFollowUp !== undefined
                  && node.role === 'assistant'
                  && nodeSettled
                  && branchTargetSettled
                const askDisabledReason = node.role !== 'assistant'
                  ? undefined
                  : readOnlyReason !== undefined
                    ? readOnlyReason
                    : onAskFollowUp === undefined
                      ? undefined
                      : !nodeSettled || (branchTargetNode !== undefined && !branchTargetSettled)
                        ? labels.askWaitForCompletion
                        : branchTargetNode === undefined
                          ? labels.askUnavailable
                          : undefined
                const cardStyle = {
                  ...nodeStyle(position.rect),
                  '--fold-card-delay': `${Math.max(0, position.depth - 1) * 260 + Math.max(0, branch?.nodeIds.indexOf(node.nodeId) ?? 0) * 60}ms`,
                } as React.CSSProperties
                return (
                  <MessageNodeCard
                    key={node.nodeId}
                    node={node}
                    style={cardStyle}
                    labels={labels}
                    timestamp={formatTime(node.time, timeFormatter)}
                    selected={interaction.selectedNodeId === node.nodeId}
                    focused={focused}
                    dimmed={focus.dimmedNodeIds.has(node.nodeId)}
                    root={node.branchId === null}
                    firstInBranch={firstInBranch}
                    {...quote === undefined ? {} : { quote }}
                    quoteInvalid={quoteInvalid}
                    canAsk={canAsk}
                    {...askDisabledReason === undefined ? {} : { askDisabledReason }}
                    canContinue={readOnlyReason === undefined
                      && onContinueBranch !== undefined
                      && node.branchId !== null
                      && node.role === 'assistant'
                      && node.state === 'complete'
                      && branchTailNodeIds.has(node.nodeId)}
                    canDelete={firstInBranch
                      && node.branchId !== null
                      && onDeleteBranch !== undefined}
                    onSelect={() => { selectNode(node.nodeId) }}
                    onAsk={() => {
                      dispatch({ type: 'composer/open', nodeId: node.nodeId, mode: 'ask' })
                    }}
                    onContinue={() => {
                      dispatch({ type: 'composer/open', nodeId: node.nodeId, mode: 'continue' })
                    }}
                    onFocus={() => {
                      noteManualViewportChange()
                      dispatch({ type: 'focus/set', nodeId: focused ? undefined : node.nodeId })
                    }}
                    onDelete={() => {
                      if (node.branchId === null) return
                      requestBranchDelete(node.branchId)
                    }}
                  />
                )
              })}
              {projection.branches.map((branch) => {
                const branchId = branch.record.branchId
                const capsule = branchCapsules.get(branchId)
                const region = branchRegions.get(branchId)
                if (capsule === undefined && region === undefined) return null
                const collapsed = capsule !== undefined
                const rect = capsule?.rect ?? region!.rect
                const pathLabel = branch.branchPath.join('.')
                const dimmed = focus.active && !focus.highlightedBranchIds.has(branchId)
                const morphStyle = {
                  ...nodeStyle(rect),
                  '--fold-stagger': `${80 + Math.max(0, branch.record.siblingOrdinal - 1) * 70}ms`,
                } as React.CSSProperties
                return (
                  <div
                    key={branchId}
                    className={css.branchMorph}
                    style={morphStyle}
                    data-mode={collapsed ? 'capsule' : 'expanded'}
                    data-dimmed={dimmed || undefined}
                    data-activity={capsule?.activity}
                    data-from-cards={collapsed && collapsingToCapsuleIds.has(branchId) || undefined}
                  >
                    {capsule !== undefined
                      ? (
                        <>
                          <button
                            type="button"
                            className={css.capsuleMain}
                            aria-label={`${labels.expandBranchPath(capsule.pathLabel)} · ${labels.collapsedCount(capsule.messageCount)} · ${activityLabel(capsule.activity)}`}
                            onClick={(event) => {
                              noteManualViewportChange()
                              startCapsuleMorph(capsule)
                              if (event.altKey) {
                                dispatch({
                                  type: 'branch/deep-expand',
                                  ...deepExpansionTargetsForBranch(projection, branchId),
                                })
                              } else {
                                dispatch({
                                  type: 'branch/toggle',
                                  branchId,
                                  childAnchorDotIds: childAnchorDotIdsForBranch(projection, branchId),
                                })
                              }
                              setPendingCenterNodeId(branch.nodeIds[0] ?? capsule.anchorNodeId)
                            }}
                          >
                            {capsule.activity !== 'complete' && (
                              <span
                                className={css.capsuleStatus}
                                data-activity={capsule.activity}
                                title={activityLabel(capsule.activity)}
                                aria-label={activityLabel(capsule.activity)}
                              />
                            )}
                            <span className={css.capsulePath}>{capsule.pathLabel}</span>
                            <span className={css.capsuleSummary}>{capsule.firstQuestionSummary}</span>
                            {capsule.childBranchCount > 0 && (
                              <span
                                className={css.capsuleChildren}
                                title={labels.childBranchCount(capsule.childBranchCount)}
                              >
                                {labels.childBranchCount(capsule.childBranchCount)}
                              </span>
                            )}
                            <span className={css.capsuleCount}>+{capsule.messageCount}</span>
                            <span className={css.capsuleArrow} aria-hidden="true">›</span>
                          </button>
                          {onDeleteBranch !== undefined && (
                            <button
                              type="button"
                              className={css.capsuleDelete}
                              aria-label={labels.deleteBranch}
                              onClick={(event) => {
                                event.stopPropagation()
                                requestBranchDelete(branchId)
                              }}
                            >
                              <span aria-hidden="true">×</span>
                            </button>
                          )}
                        </>
                      )
                      : (
                        <>
                          {expandingCapsule?.branchId === branchId && (
                            <span className={css.capsuleMorphRow} aria-hidden="true">
                              <span className={css.capsulePath}>{expandingCapsule.pathLabel}</span>
                              <span className={css.capsuleSummary}>
                                {expandingCapsule.firstQuestionSummary}
                              </span>
                              {expandingCapsule.childBranchCount > 0 && (
                                <span className={css.capsuleChildren}>
                                  {labels.childBranchCount(expandingCapsule.childBranchCount)}
                                </span>
                              )}
                              <span className={css.capsuleCount}>+{expandingCapsule.messageCount}</span>
                              <span className={css.capsuleArrow}>›</span>
                            </span>
                          )}
                          <span className={css.branchRegionLabel}>{labels.independentContext}</span>
                          <button
                            type="button"
                            className={css.collapseHotZone}
                            aria-label={labels.collapseBranchPath(pathLabel)}
                            onClick={() => {
                              noteManualViewportChange()
                              startCardExit([branchId], true)
                              dispatch({ type: 'branch/toggle', branchId })
                              setPendingCenterNodeId(branch.anchorNodeId ?? null)
                            }}
                          >
                            <IconChevronUpOutline14 size={16} />
                          </button>
                        </>
                      )}
                  </div>
                )
              })}
              {layout.anchorControls.map(control => {
                const actionLabel = control.open
                  ? labels.collapseAnchorGroup(control.branchCount, control.messageCount)
                  : labels.expandAnchorGroup(control.branchCount, control.messageCount)
                const dimmed = focus.active
                  && !control.branchIds.some(branchId => focus.highlightedBranchIds.has(branchId))
                return (
                  <button
                    key={control.anchorDotId}
                    type="button"
                    className={css.anchorControl}
                    style={nodeStyle(control.rect)}
                    data-open={control.open}
                    data-nested={control.nested || undefined}
                    data-activity={control.activity}
                    data-dimmed={dimmed || undefined}
                    data-rippling={ripplingAnchorId === control.anchorDotId || undefined}
                    aria-label={`${actionLabel} · ${activityLabel(control.activity)}`}
                    title={`${actionLabel} · ${activityLabel(control.activity)}`}
                    onClick={(event) => {
                      noteManualViewportChange()
                      triggerAnchorRipple(control.anchorDotId)
                      if (control.open) {
                        startCapsuleExit([control.anchorDotId])
                        startCardExit(control.branchIds)
                      }
                      if (!control.open && event.altKey) {
                        dispatch({
                          type: 'anchor/deep-expand',
                          ...deepExpansionTargetsForAnchor(projection, control.anchorDotId),
                        })
                      } else {
                        dispatch({
                          type: 'anchor/toggle',
                          anchorDotId: control.anchorDotId,
                          branchIds: control.branchIds,
                        })
                      }
                      setPendingCenterNodeId(control.anchorNodeId)
                    }}
                  >
                    <span className={css.anchorGlyph} aria-hidden="true">
                      <span className={css.anchorStrokeVertical} />
                      <span className={css.anchorStrokeHorizontal} />
                    </span>
                  </button>
                )
              })}
              {exitingCapsules.map(({ capsule, reverseIndex }) => (
                <div
                  key={`exiting-capsule:${capsule.branchId}`}
                  className={`${css.branchMorph} ${css.capsuleExit}`}
                  style={{
                    ...nodeStyle(capsule.rect),
                    '--fold-exit-delay': `${Math.min(reverseIndex * 40, 80)}ms`,
                  } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <span className={css.capsuleExitContent}>
                    <span className={css.capsulePath}>{capsule.pathLabel}</span>
                    <span className={css.capsuleSummary}>{capsule.firstQuestionSummary}</span>
                    <span className={css.capsuleCount}>+{capsule.messageCount}</span>
                  </span>
                </div>
              ))}
              {exitingCards.map(({ node, rect }) => (
                <div
                  key={`exiting-card:${node.nodeId}`}
                  className={`${css.nodeCard} ${css.cardExit}`}
                  style={nodeStyle(rect)}
                  data-role={node.role}
                  aria-hidden="true"
                >
                  <div className={css.nodeHeader}>
                    <strong className={css.nodeLabel}>{displayLabelOf(node)}</strong>
                    <span className={css.nodeRole}>{node.role === 'user' ? labels.you : labels.assistant}</span>
                  </div>
                  <p className={css.nodeSummary}>{node.summary}</p>
                </div>
              ))}
              {composerNode !== undefined
                && composerLayout !== undefined
                && composerMode !== undefined
                && (composerMode === 'ask' ? onAskFollowUp !== undefined : onContinueBranch !== undefined)
                && (
                <FollowUpComposer
                  key={`${composerNode.nodeId}:${composerMode}`}
                  node={composerTargetNode ?? composerNode}
                  mode={composerMode}
                  labels={labels}
                  savedQuotes={quotesByNodeId.get((composerTargetNode ?? composerNode).nodeId) ?? []}
                  onRemoveQuote={(quoteId) => {
                    removeQuote((composerTargetNode ?? composerNode).nodeId, quoteId)
                  }}
                  {...composerMode === 'ask'
                    && composerTargetNode !== undefined
                    && composerTargetNode.nodeId !== composerNode.nodeId
                    ? { branchTargetLabel: displayLabelOf(composerTargetNode) }
                    : {}}
                  style={{
                    left: composerMode === 'ask'
                      ? composerLayout.rect.x + composerLayout.rect.width + 24
                      : composerLayout.rect.x,
                    top: composerMode === 'ask'
                      ? composerLayout.rect.y + 18
                      : composerLayout.rect.y + composerLayout.rect.height + 24,
                  }}
                  submit={(question, clientRequestId, anchorRange) => {
                    beginStreamFollow()
                    const anchorNode = composerTargetNode ?? composerNode
                    const request = composerMode === 'ask'
                      ? onAskFollowUp!({
                        clientRequestId,
                        anchor: anchorNode,
                        question,
                        ...(anchorRange === undefined ? {} : { anchorRange }),
                      })
                      : onContinueBranch!({ clientRequestId, tail: composerNode, question })
                    return request.then((value) => {
                      if (composerMode === 'ask') clearQuotes(anchorNode.nodeId)
                      return value
                    })
                  }}
                  close={() => { dispatch({ type: 'composer/close' }) }}
                />
              )}
            </div>
          )}
        {projection.nodes.length > 0 && (
          <>
            <div className={css.zoomControls} aria-label={labels.canvas}>
              <button type="button" aria-label={labels.zoomOut} onClick={() => { zoomAtCenter(1 / 1.2) }}>−</button>
              <button type="button" aria-label={labels.zoomIn} onClick={() => { zoomAtCenter(1.2) }}>+</button>
              <button
                type="button"
                aria-label={labels.fit}
                onClick={() => {
                  noteManualViewportChange()
                  setTransform(fitViewport(layout.bounds, viewportSize))
                }}
              >
                {labels.fit}
              </button>
            </div>
            <TreeMinimap
              model={minimap}
              label={labels.minimap}
              onNavigate={point => {
                noteManualViewportChange()
                setTransform(current => navigateFromMinimap(minimap, point, current, viewportSize))
              }}
            />
          </>
        )}
        {selectedDetails !== undefined && (
          <MessageDetails
            node={selectedDetails}
            labels={labels}
            {...selectedDetailsIsBranchFirst
              && selectedDetailsBranch?.anchorStatus === 'range-valid'
              && selectedDetailsBranch.record.anchorRange !== undefined
              ? { quote: selectedDetailsBranch.record.anchorRange.text }
              : {}}
            quoteInvalid={selectedDetailsIsBranchFirst
              && selectedDetailsBranch?.anchorStatus === 'range-invalid'}
            savedQuotes={quotesByNodeId.get(selectedDetails.nodeId) ?? []}
            onAddQuote={(text, note) => { addQuote(selectedDetails.nodeId, text, note) }}
            onRemoveQuote={(quoteId) => { removeQuote(selectedDetails.nodeId, quoteId) }}
            onClose={() => {
              dispatch({ type: 'node/toggle-expanded', nodeId: selectedDetails.nodeId })
              dispatch({ type: 'selection/set', nodeId: undefined })
            }}
          />
        )}
      </div>
      <Modal
        open={deleteRequest !== null}
        onClose={() => { if (!deletePending) setDeleteRequest(null) }}
        title={labels.deleteTitle}
        closeLabel={labels.close}
        {...deleteRequest === null ? {} : {
          description: deletionConfirmationDescription(labels, deleteRequest, deletionMode),
        }}
        footer={(
          <>
            <Button variant="ghost" disabled={deletePending} onClick={() => { setDeleteRequest(null) }}>
              {labels.cancel}
            </Button>
            <Button variant="primary" disabled={deletePending} onClick={confirmDelete}>
              {deletePending ? labels.deletePending : labels.deleteConfirm}
            </Button>
          </>
        )}
      >
        {deleteFailure !== null && <p className={css.inlineError} role="alert">{deleteFailure}</p>}
      </Modal>
    </section>
  )
}
