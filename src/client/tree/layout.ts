import type { BranchProjectionView, ConversationTreeProjection, TreeEdgeView } from '../../shared/projection.ts'
import type { MessageNodeView } from '../../shared/types.ts'
import { inflateRect, unionRects, type Point, type Rect } from './geometry.ts'
import {
  deriveCollapseState,
  type AnchorGroupSummary,
  type CollapsedBranchSummary,
  type FoldActivityState,
} from './navigation.ts'

export interface TreeLayoutOptions {
  nodeWidth?: number
  nodeHeight?: number
  rowGap?: number
  columnGap?: number
  branchGap?: number
  canvasPadding?: number
  regionPadding?: number
  collapsedBranchIds?: ReadonlySet<string>
  anchorDotIds?: ReadonlySet<string>
}

export interface ResolvedTreeLayoutOptions {
  nodeWidth: number
  nodeHeight: number
  rowGap: number
  columnGap: number
  branchGap: number
  canvasPadding: number
  regionPadding: number
}

export interface TreeNodeLayout {
  nodeId: string
  branchId: string | null
  depth: number
  rect: Rect
}

export interface TreeEdgeLayout {
  edgeId: string
  kind: TreeEdgeView['kind']
  sourceNodeId: string
  targetNodeId: string
  start: Point
  end: Point
  path: string
}

export interface BranchRegionLayout {
  branchId: string
  depth: number
  rect: Rect
}

export interface AnchorGroupControlLayout {
  anchorDotId: string
  anchorNodeId: string
  branchIds: readonly string[]
  branchCount: number
  messageCount: number
  depth: number
  open: boolean
  nested: boolean
  activity: FoldActivityState
  rect: Rect
  start: Point
  end: Point
  path: string
}

export interface BranchCapsuleLayout {
  branchId: string
  anchorDotId: string
  anchorNodeId: string
  pathLabel: string
  firstQuestionSummary: string
  childBranchCount: number
  branchCount: number
  messageCount: number
  hiddenNodeCount: number
  depth: number
  activity: FoldActivityState
  rect: Rect
  start: Point
  end: Point
  path: string
}

/** @deprecated Consume branchCapsules. Kept for one compatibility release. */
export type CollapsedBranchBadgeLayout = BranchCapsuleLayout

export interface ConversationTreeLayout {
  options: ResolvedTreeLayoutOptions
  nodes: readonly TreeNodeLayout[]
  edges: readonly TreeEdgeLayout[]
  branchRegions: readonly BranchRegionLayout[]
  anchorControls: readonly AnchorGroupControlLayout[]
  branchCapsules: readonly BranchCapsuleLayout[]
  /** @deprecated Consume branchCapsules. */
  collapsedBadges: readonly CollapsedBranchBadgeLayout[]
  bounds: Rect
}

export const DEFAULT_TREE_LAYOUT_OPTIONS: ResolvedTreeLayoutOptions = Object.freeze({
  nodeWidth: 280,
  nodeHeight: 120,
  rowGap: 32,
  columnGap: 120,
  branchGap: 56,
  canvasPadding: 80,
  regionPadding: 24,
})

const CAPSULE_WIDTH = 270
const CAPSULE_HEIGHT = 34
/** Adjacent capsules of one lane stack tightly, like a list. */
const CAPSULE_STACK_GAP = 8
/** Extra clearance a dashed region needs after a capsule (region inflation + breathing room). */
const CAPSULE_TO_REGION_GAP = 32
const ANCHOR_CONTROL_SIZE = 28
const NESTED_ANCHOR_CONTROL_SIZE = 20
const ANCHOR_CONTROL_GAP = 24

function positive(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : value
}

function nonNegative(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value < 0 ? fallback : value
}

export function resolveTreeLayoutOptions(
  options: TreeLayoutOptions = {},
): ResolvedTreeLayoutOptions {
  return Object.freeze({
    nodeWidth: positive(options.nodeWidth, DEFAULT_TREE_LAYOUT_OPTIONS.nodeWidth),
    nodeHeight: positive(options.nodeHeight, DEFAULT_TREE_LAYOUT_OPTIONS.nodeHeight),
    rowGap: nonNegative(options.rowGap, DEFAULT_TREE_LAYOUT_OPTIONS.rowGap),
    columnGap: nonNegative(options.columnGap, DEFAULT_TREE_LAYOUT_OPTIONS.columnGap),
    branchGap: nonNegative(options.branchGap, DEFAULT_TREE_LAYOUT_OPTIONS.branchGap),
    canvasPadding: nonNegative(options.canvasPadding, DEFAULT_TREE_LAYOUT_OPTIONS.canvasPadding),
    regionPadding: nonNegative(options.regionPadding, DEFAULT_TREE_LAYOUT_OPTIONS.regionPadding),
  })
}

function compareNodes(left: MessageNodeView, right: MessageNodeView): number {
  return left.seq - right.seq || left.time - right.time || left.nodeId.localeCompare(right.nodeId)
}

function compareBranchRecords(left: BranchProjectionView, right: BranchProjectionView): number {
  return left.record.siblingOrdinal - right.record.siblingOrdinal
    || left.record.createdAt - right.record.createdAt
    || left.record.branchId.localeCompare(right.record.branchId)
}

function branchDepth(
  branch: BranchProjectionView,
  branches: ReadonlyMap<string, BranchProjectionView>,
): number {
  let depth = 1
  let parentId = branch.record.parentBranchId
  const visited = new Set([branch.record.branchId])
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = branches.get(parentId)
    if (parent === undefined) break
    depth += 1
    parentId = parent.record.parentBranchId
  }
  return depth
}

function branchPath(start: Point, end: Point): string {
  const distance = Math.max(40, Math.abs(end.x - start.x) * 0.5)
  return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`
}

function sequencePath(start: Point, end: Point): string {
  const distance = Math.max(24, Math.abs(end.y - start.y) * 0.45)
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + distance}, ${end.x} ${end.y - distance}, ${end.x} ${end.y}`
}

function edgeGeometry(
  edge: TreeEdgeView,
  source: Rect,
  target: Rect,
): Omit<TreeEdgeLayout, 'edgeId' | 'kind' | 'sourceNodeId' | 'targetNodeId'> {
  if (edge.kind === 'branch') {
    const start = { x: source.x + source.width, y: source.y + source.height / 2 }
    const end = { x: target.x, y: target.y + target.height / 2 }
    return { start, end, path: branchPath(start, end) }
  }
  const start = { x: source.x + source.width / 2, y: source.y + source.height }
  const end = { x: target.x + target.width / 2, y: target.y }
  return { start, end, path: sequencePath(start, end) }
}

function anchorControlRect(anchor: Rect, nested: boolean): Rect {
  const size = nested ? NESTED_ANCHOR_CONTROL_SIZE : ANCHOR_CONTROL_SIZE
  return {
    x: anchor.x + anchor.width + ANCHOR_CONTROL_GAP,
    y: anchor.y + (anchor.height - size) / 2,
    width: size,
    height: size,
  }
}

function rightEdgeCenter(rect: Rect): Point {
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
}

/**
 * A capsule's edge starts at the anchor group's dot control, not at the
 * anchor card: card → control → capsules reads as one hub, and edges no
 * longer pile up on the card's right edge.
 */
function capsuleLayout(
  summary: CollapsedBranchSummary,
  control: Rect,
  x: number,
  y: number,
): BranchCapsuleLayout {
  const rect = { x, y, width: CAPSULE_WIDTH, height: CAPSULE_HEIGHT }
  const start = rightEdgeCenter(control)
  const end = { x: rect.x, y: rect.y + rect.height / 2 }
  return {
    ...summary,
    rect,
    start,
    end,
    path: branchPath(start, end),
  }
}

function anchorControlLayout(
  summary: AnchorGroupSummary,
  anchor: Rect,
): AnchorGroupControlLayout {
  const nested = summary.depth > 1
  const rect = anchorControlRect(anchor, nested)
  const start = { x: anchor.x + anchor.width, y: anchor.y + anchor.height / 2 }
  const end = { x: rect.x, y: rect.y + rect.height / 2 }
  return {
    ...summary,
    nested,
    rect,
    start,
    end,
    path: branchPath(start, end),
  }
}

/**
 * Deterministic lane layout. The root session never moves horizontally; every
 * nested session owns one column to the right of its parent branch depth.
 * Capsules reserve the same lane as cards, so mixed folding cannot overlap.
 */
export function layoutConversationTree(
  projection: ConversationTreeProjection,
  inputOptions: TreeLayoutOptions = {},
): ConversationTreeLayout {
  const options = resolveTreeLayoutOptions(inputOptions)
  const collapsed = deriveCollapseState(
    projection,
    inputOptions.collapsedBranchIds ?? new Set<string>(),
    inputOptions.anchorDotIds ?? new Set<string>(),
  )
  const nodesById = new Map(projection.nodes.map(node => [node.nodeId, node] as const))
  const branches = new Map(
    projection.branches.map(branch => [branch.record.branchId, branch] as const),
  )
  const nodeLayouts = new Map<string, TreeNodeLayout>()
  const nextFreeYByDepth = new Map<number, { y: number; kind: 'capsule' | 'lane' | 'none' }>()
  // Regions inflate by regionPadding on every side, so two stacked lanes need
  // more clearance than the raw branchGap or their dashed frames overlap.
  const laneGap = Math.max(options.branchGap, options.regionPadding * 2 + 16)

  const rootNodes = projection.nodes
    .filter(node => node.branchId === null)
    .sort(compareNodes)
  rootNodes.forEach((node, index) => {
    nodeLayouts.set(node.nodeId, {
      nodeId: node.nodeId,
      branchId: null,
      depth: 0,
      rect: {
        x: options.canvasPadding,
        y: options.canvasPadding + index * (options.nodeHeight + options.rowGap),
        width: options.nodeWidth,
        height: options.nodeHeight,
      },
    })
  })

  const branchDepths = new Map(
    projection.branches.map(branch => [branch.record.branchId, branchDepth(branch, branches)] as const),
  )
  const summaries = new Map(collapsed.summaries.map(summary => [summary.branchId, summary] as const))
  const branchCapsules: BranchCapsuleLayout[] = []
  const maximumDepth = Math.max(0, ...branchDepths.values())

  for (let depth = 1; depth <= maximumDepth; depth++) {
    const atDepth = projection.branches
      .filter(branch => branchDepths.get(branch.record.branchId) === depth)
      .filter(branch => collapsed.visibleBranchIds.has(branch.record.branchId)
        || summaries.has(branch.record.branchId))
      .sort((left, right) => {
        const leftY = left.anchorNodeId === undefined
          ? Number.POSITIVE_INFINITY
          : (nodeLayouts.get(left.anchorNodeId)?.rect.y ?? Number.POSITIVE_INFINITY)
        const rightY = right.anchorNodeId === undefined
          ? Number.POSITIVE_INFINITY
          : (nodeLayouts.get(right.anchorNodeId)?.rect.y ?? Number.POSITIVE_INFINITY)
        return leftY - rightY || compareBranchRecords(left, right)
      })

    for (const branch of atDepth) {
      const anchor = branch.anchorNodeId === undefined
        ? undefined
        : nodeLayouts.get(branch.anchorNodeId)?.rect
      const desiredY = anchor?.y ?? options.canvasPadding
      const cursor = nextFreeYByDepth.get(depth) ?? { y: options.canvasPadding, kind: 'none' as const }
      const x = options.canvasPadding + depth * (options.nodeWidth + options.columnGap)
      const summary = summaries.get(branch.record.branchId)
      if (summary !== undefined) {
        if (anchor !== undefined) {
          const capsuleY = Math.max(
            cursor.y,
            anchor.y + (anchor.height - CAPSULE_HEIGHT) / 2,
          )
          const control = anchorControlRect(anchor, summary.depth > 1)
          branchCapsules.push(capsuleLayout(summary, control, x, capsuleY))
          nextFreeYByDepth.set(depth, {
            y: capsuleY + CAPSULE_HEIGHT + CAPSULE_STACK_GAP,
            kind: 'capsule',
          })
        }
        continue
      }
      const startY = Math.max(
        desiredY,
        cursor.kind === 'capsule' ? cursor.y + CAPSULE_TO_REGION_GAP - CAPSULE_STACK_GAP : cursor.y,
      )

      const branchNodes = branch.nodeIds
        .map(nodeId => nodesById.get(nodeId))
        .filter((node): node is MessageNodeView => node !== undefined)
        .filter(node => !collapsed.hiddenNodeIds.has(node.nodeId))
        .sort(compareNodes)
      branchNodes.forEach((node, index) => {
        nodeLayouts.set(node.nodeId, {
          nodeId: node.nodeId,
          branchId: branch.record.branchId,
          depth,
          rect: {
            x,
            y: startY + index * (options.nodeHeight + options.rowGap),
            width: options.nodeWidth,
            height: options.nodeHeight,
          },
        })
      })
      if (branchNodes.length > 0) {
        const laneHeight = branchNodes.length * options.nodeHeight
          + (branchNodes.length - 1) * options.rowGap
        nextFreeYByDepth.set(depth, { y: startY + laneHeight + laneGap, kind: 'lane' })
      }
    }
  }

  const orderedNodeLayouts = [...nodeLayouts.values()]
    .sort((left, right) => left.depth - right.depth
      || left.rect.y - right.rect.y
      || left.nodeId.localeCompare(right.nodeId))
  const controlRectByAnchorNodeId = new Map(collapsed.anchorGroups.flatMap((summary) => {
    const anchor = nodeLayouts.get(summary.anchorNodeId)?.rect
    return anchor === undefined
      ? []
      : [[summary.anchorNodeId, anchorControlRect(anchor, summary.depth > 1)] as const]
  }))
  const edgeLayouts = projection.edges.flatMap((edge): TreeEdgeLayout[] => {
    const source = nodeLayouts.get(edge.sourceNodeId)?.rect
    const target = nodeLayouts.get(edge.targetNodeId)?.rect
    if (source === undefined || target === undefined) return []
    // Branch edges leave from the anchor group's dot control so every line of
    // the fan shares the card → control → branches hub.
    const control = edge.kind === 'branch'
      ? controlRectByAnchorNodeId.get(edge.sourceNodeId)
      : undefined
    const geometry = edgeGeometry(edge, source, target)
    if (control !== undefined) {
      const start = rightEdgeCenter(control)
      return [{
        edgeId: edge.edgeId,
        kind: edge.kind,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        start,
        end: geometry.end,
        path: branchPath(start, geometry.end),
      }]
    }
    return [{
      edgeId: edge.edgeId,
      kind: edge.kind,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      ...geometry,
    }]
  }).sort((left, right) => left.edgeId.localeCompare(right.edgeId))

  const branchRegions = projection.branches.flatMap((branch): BranchRegionLayout[] => {
    const branchId = branch.record.branchId
    if (!collapsed.visibleBranchIds.has(branchId)) return []
    const branchNodeRects = orderedNodeLayouts
      .filter(layout => layout.branchId === branchId)
      .map(layout => layout.rect)
    if (branchNodeRects.length === 0) return []
    return [{
      branchId,
      depth: branchDepths.get(branchId) ?? 1,
      rect: inflateRect(unionRects(branchNodeRects), options.regionPadding),
    }]
  }).sort((left, right) => left.depth - right.depth
    || left.rect.y - right.rect.y
    || left.branchId.localeCompare(right.branchId))

  const anchorControls = collapsed.anchorGroups.flatMap((summary): AnchorGroupControlLayout[] => {
    const anchor = nodeLayouts.get(summary.anchorNodeId)?.rect
    return anchor === undefined ? [] : [anchorControlLayout(summary, anchor)]
  }).sort((left, right) => left.depth - right.depth
    || left.rect.y - right.rect.y
    || left.anchorDotId.localeCompare(right.anchorDotId))

  const allRects: Rect[] = [
    ...orderedNodeLayouts.map(layout => layout.rect),
    ...branchCapsules.map(capsule => capsule.rect),
    ...anchorControls.map(control => control.rect),
    ...branchRegions.map(region => region.rect),
  ]
  const frozenCapsules = Object.freeze(branchCapsules)
  return Object.freeze({
    options,
    nodes: Object.freeze(orderedNodeLayouts),
    edges: Object.freeze(edgeLayouts),
    branchRegions: Object.freeze(branchRegions),
    anchorControls: Object.freeze(anchorControls),
    branchCapsules: frozenCapsules,
    collapsedBadges: frozenCapsules,
    bounds: unionRects(allRects),
  })
}
