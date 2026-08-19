import type { ConversationTreeLayout } from './layout.ts'
import { clamp, intersectRects, type Point, type Rect, type Size } from './geometry.ts'
import {
  centerViewportOn,
  visibleWorldRect,
  type ViewportTransform,
} from './viewport.ts'

export interface MinimapNode {
  nodeId: string
  branchId: string | null
  rect: Rect
}

export interface MinimapEdge {
  edgeId: string
  kind: 'sequence' | 'branch'
  start: Point
  end: Point
}

export interface MinimapModel {
  size: Size
  worldBounds: Rect
  scale: number
  offset: Point
  nodes: readonly MinimapNode[]
  edges: readonly MinimapEdge[]
  viewportRect: Rect
}

function mapPoint(point: Point, scale: number, offset: Point): Point {
  return {
    x: point.x * scale + offset.x,
    y: point.y * scale + offset.y,
  }
}

function mapRect(rect: Rect, scale: number, offset: Point): Rect {
  const point = mapPoint(rect, scale, offset)
  return {
    x: point.x,
    y: point.y,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

export function createMinimapModel(
  layout: ConversationTreeLayout,
  transform: ViewportTransform,
  viewport: Size,
  size: Size,
  padding = 8,
): MinimapModel {
  const safePadding = Math.max(0, padding)
  const worldBounds = layout.bounds.width === 0 || layout.bounds.height === 0
    ? { x: 0, y: 0, width: 1, height: 1 }
    : layout.bounds
  const availableWidth = Math.max(1, size.width - safePadding * 2)
  const availableHeight = Math.max(1, size.height - safePadding * 2)
  const scale = Math.min(
    availableWidth / worldBounds.width,
    availableHeight / worldBounds.height,
  )
  const offset = {
    x: (size.width - worldBounds.width * scale) / 2 - worldBounds.x * scale,
    y: (size.height - worldBounds.height * scale) / 2 - worldBounds.y * scale,
  }
  const visible = intersectRects(visibleWorldRect(transform, viewport), worldBounds)

  return Object.freeze({
    size,
    worldBounds,
    scale,
    offset,
    nodes: Object.freeze([
      ...layout.nodes.map(node => ({
        nodeId: node.nodeId,
        branchId: node.branchId,
        rect: mapRect(node.rect, scale, offset),
      })),
      ...layout.anchorControls.map(control => ({
        nodeId: `anchor:${control.anchorDotId}`,
        branchId: null,
        rect: mapRect(control.rect, scale, offset),
      })),
      ...layout.branchCapsules.map(capsule => ({
        nodeId: `capsule:${capsule.branchId}`,
        branchId: capsule.branchId,
        rect: mapRect(capsule.rect, scale, offset),
      })),
    ]),
    edges: Object.freeze([
      ...layout.edges.map(edge => ({
        edgeId: edge.edgeId,
        kind: edge.kind,
        start: mapPoint(edge.start, scale, offset),
        end: mapPoint(edge.end, scale, offset),
      })),
      ...layout.anchorControls.map(control => ({
        edgeId: `anchor-control:${control.anchorDotId}`,
        kind: 'branch' as const,
        start: mapPoint(control.start, scale, offset),
        end: mapPoint(control.end, scale, offset),
      })),
      ...layout.branchCapsules.map(capsule => ({
        edgeId: `capsule:${capsule.branchId}`,
        kind: 'branch' as const,
        start: mapPoint(capsule.start, scale, offset),
        end: mapPoint(capsule.end, scale, offset),
      })),
    ]),
    viewportRect: mapRect(visible, scale, offset),
  })
}

/** Convert a minimap click or drag location into a centered world location. */
export function minimapPointToWorld(model: MinimapModel, point: Point): Point {
  const left = model.worldBounds.x * model.scale + model.offset.x
  const top = model.worldBounds.y * model.scale + model.offset.y
  const right = left + model.worldBounds.width * model.scale
  const bottom = top + model.worldBounds.height * model.scale
  const x = clamp(point.x, left, right)
  const y = clamp(point.y, top, bottom)
  return {
    x: (x - model.offset.x) / model.scale,
    y: (y - model.offset.y) / model.scale,
  }
}

export function navigateFromMinimap(
  model: MinimapModel,
  point: Point,
  transform: ViewportTransform,
  viewport: Size,
): ViewportTransform {
  return centerViewportOn(transform, viewport, minimapPointToWorld(model, point))
}
