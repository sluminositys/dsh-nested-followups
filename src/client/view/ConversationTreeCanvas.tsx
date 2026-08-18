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
import {
  Button,
  IconCloseOutline16,
  IconSearchOutline16,
  MarkdownText,
  MessageText,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { displayLabelOf } from '../../shared/labels.ts'
import type { AnchorRange, MessageNodeView } from '../../shared/types.ts'
import {
  centerOf,
  type Point,
  type Size,
} from '../tree/geometry.ts'
import { layoutConversationTree } from '../tree/layout.ts'
import {
  createMinimapModel,
  navigateFromMinimap,
} from '../tree/minimap.ts'
import {
  deriveFocusState,
  searchTreeNodes,
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
  treeInteractionReducer,
} from './state.ts'
import { TreeMinimap } from './TreeMinimap.tsx'
import css from './ConversationTreeCanvas.module.css'

const MINIMAP_SIZE: Size = { width: 190, height: 128 }

interface PointerPan {
  readonly pointerId: number
  readonly point: Point
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

function MessageDetails({
  node,
  labels,
  quote,
  quoteInvalid,
  onClose,
}: {
  readonly node: MessageNodeView
  readonly labels: TreeViewLabels
  readonly quote?: string
  readonly quoteInvalid: boolean
  readonly onClose: () => void
}) {
  return (
    <aside className={css.detailsDrawer} data-tree-scroll="true" aria-label={labels.details}>
      <header className={css.detailsHeader}>
        <span className={css.detailsTitle}>{displayLabelOf(node)} · {node.role === 'user' ? labels.you : labels.assistant}</span>
        <button type="button" className={css.iconButton} aria-label={labels.close} onClick={onClose}>
          <IconCloseOutline16 size={14} />
        </button>
      </header>
      <div className={css.detailsContent}>
        {quote !== undefined && (
          <blockquote className={css.anchorQuote} aria-label={labels.quoteSelected}>{quote}</blockquote>
        )}
        {quoteInvalid && <p className={css.invalidQuote} role="status">{labels.quoteInvalid}</p>}
        {node.role === 'assistant'
          ? <MarkdownText text={node.text} streaming={node.state === 'streaming'} />
          : <MessageText text={node.text} />}
      </div>
    </aside>
  )
}

function FollowUpComposer({
  node,
  mode,
  labels,
  branchTargetLabel,
  style,
  submit,
  close,
}: {
  readonly node: MessageNodeView
  readonly mode: 'ask' | 'continue'
  readonly labels: TreeViewLabels
  readonly branchTargetLabel?: string
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
  const [anchorRange, setAnchorRange] = useState<AnchorRange | undefined>()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const question = draft.trim()
    if (question === '' || pending) return
    setPending(true)
    setFailure(null)
    void submit(question, clientRequestId, mode === 'ask' ? anchorRange : undefined).then(() => {
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
      {mode === 'ask'
        && branchTargetLabel === undefined
        && node.text.length > 0 && (
        <label className={css.quoteSelector}>
          <span>{labels.quoteSource}</span>
          <textarea
            className={css.quoteSource}
            rows={4}
            value={node.text}
            readOnly
            disabled={pending}
            aria-label={labels.quoteSource}
            onSelect={(event) => {
              setAnchorRange(anchorRangeFromSelection(
                node.text,
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
              ))
            }}
          />
        </label>
      )}
      {anchorRange !== undefined && (
        <div className={css.selectedQuote} data-tree-scroll="true">
          <span>{labels.quoteSelected}</span>
          <blockquote>{anchorRange.text}</blockquote>
          <button
            type="button"
            className={css.clearQuote}
            disabled={pending}
            onClick={() => { setAnchorRange(undefined) }}
          >
            {labels.clearQuote}
          </button>
        </div>
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
  const [interaction, dispatch] = useReducer(treeInteractionReducer, undefined, createTreeInteractionState)
  const [transform, setTransform] = useState<ViewportTransform>({ x: 0, y: 0, zoom: 1 })
  const [panning, setPanning] = useState(false)
  const [deleteRequest, setDeleteRequest] = useState<DeleteBranchRequest | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null)
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerPanRef = useRef<PointerPan | null>(null)
  const fittedTreeRef = useRef<string | null>(null)
  const autoFollowStreamingRef = useRef(true)
  const followedLiveNodeIdRef = useRef<string | null>(null)
  const viewportSize = useElementSize(viewportRef)
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    [],
  )

  useEffect(() => {
    dispatch({ type: 'projection/reconcile', projection })
  }, [projection])

  const layout = useMemo(() => layoutConversationTree(projection, {
    collapsedBranchIds: interaction.collapsedBranchIds,
  }), [interaction.collapsedBranchIds, projection])
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
  const firstNodeIds = useMemo(() => branchFirstNodeIds(projection.branches), [projection.branches])
  const branchTailNodeIds = useMemo(
    () => new Set(projection.branches.flatMap(branch => {
      const tail = branch.nodeIds.at(-1)
      return tail === undefined ? [] : [tail]
    })),
    [projection.branches],
  )
  const searchResults = useMemo(
    () => searchTreeNodes(projection, interaction.searchQuery, 12),
    [interaction.searchQuery, projection],
  )

  useEffect(() => {
    if (projection.nodes.length === 0 || viewportSize.width <= 0 || viewportSize.height <= 0) return
    if (fittedTreeRef.current === projection.tree.treeId) return
    fittedTreeRef.current = projection.tree.treeId
    setTransform(fitViewport(layout.bounds, viewportSize))
  }, [layout.bounds, projection.nodes.length, projection.tree.treeId, viewportSize])

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
                {layout.branchRegions.map(region => (
                  <g
                    key={region.branchId}
                    className={css.branchRegion}
                    data-dimmed={focus.active && !focus.highlightedBranchIds.has(region.branchId) || undefined}
                  >
                    <rect
                      x={region.rect.x}
                      y={region.rect.y}
                      width={region.rect.width}
                      height={region.rect.height}
                      rx={12}
                    />
                    <text x={region.rect.x + 12} y={region.rect.y + 18}>{labels.independentContext}</text>
                  </g>
                ))}
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
                {layout.collapsedBadges.map(badge => (
                  <path
                    key={`collapsed-edge:${badge.branchId}`}
                    className={css.edge}
                    data-kind="branch"
                    d={badge.path}
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
                return (
                  <MessageNodeCard
                    key={node.nodeId}
                    node={node}
                    style={nodeStyle(position.rect)}
                    labels={labels}
                    timestamp={formatTime(node.time, timeFormatter)}
                    selected={interaction.selectedNodeId === node.nodeId}
                    focused={focused}
                    dimmed={focus.dimmedNodeIds.has(node.nodeId)}
                    root={node.branchId === null}
                    firstInBranch={firstInBranch}
                    {...quote === undefined ? {} : { quote }}
                    quoteInvalid={quoteInvalid}
                    canAsk={readOnlyReason === undefined
                      && onAskFollowUp !== undefined
                      && node.role === 'assistant'
                      && node.state === 'complete'
                      && branchTargetNode?.state === 'complete'}
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
                    onCollapse={() => {
                      if (branch !== undefined) {
                        noteManualViewportChange()
                        dispatch({ type: 'branch/toggle', branchId: branch.record.branchId })
                      }
                    }}
                    onDelete={() => {
                      if (node.branchId === null) return
                      const impact = branchDeleteImpact(projection, node.branchId)
                      if (impact !== undefined) setDeleteRequest({ branchId: node.branchId, ...impact })
                    }}
                  />
                )
              })}
              {layout.collapsedBadges.map(badge => (
                <button
                  key={badge.branchId}
                  type="button"
                  className={css.collapsedBadge}
                  style={nodeStyle(badge.rect)}
                  aria-label={`${labels.expand}: ${labels.collapsedCount(badge.hiddenNodeCount)}`}
                  onClick={() => {
                    noteManualViewportChange()
                    dispatch({ type: 'branch/toggle', branchId: badge.branchId })
                    setPendingCenterNodeId(badge.anchorNodeId)
                  }}
                >
                  {labels.collapsedCount(badge.hiddenNodeCount)}
                </button>
              ))}
              {composerNode !== undefined
                && composerLayout !== undefined
                && composerMode !== undefined
                && (composerMode === 'ask' ? onAskFollowUp !== undefined : onContinueBranch !== undefined)
                && (
                <FollowUpComposer
                  key={`${composerNode.nodeId}:${composerMode}`}
                  node={composerNode}
                  mode={composerMode}
                  labels={labels}
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
                    return composerMode === 'ask'
                      ? onAskFollowUp!({
                        clientRequestId,
                        anchor: composerTargetNode ?? composerNode,
                        question,
                        ...(anchorRange === undefined ? {} : { anchorRange }),
                      })
                      : onContinueBranch!({ clientRequestId, tail: composerNode, question })
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
