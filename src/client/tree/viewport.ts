import { clamp, type Point, type Rect, type Size } from './geometry.ts'

export interface ViewportTransform {
  /** Screen-space horizontal translation after world scaling. */
  x: number
  /** Screen-space vertical translation after world scaling. */
  y: number
  zoom: number
}

export interface ViewportLimits {
  minimumZoom?: number
  maximumZoom?: number
}

export const DEFAULT_MINIMUM_ZOOM = 0.2
export const DEFAULT_MAXIMUM_ZOOM = 2

function zoomLimits(limits: ViewportLimits): { minimum: number; maximum: number } {
  const minimum = limits.minimumZoom !== undefined
    && Number.isFinite(limits.minimumZoom)
    && limits.minimumZoom > 0
    ? limits.minimumZoom
    : DEFAULT_MINIMUM_ZOOM
  const requestedMaximum = limits.maximumZoom !== undefined
    && Number.isFinite(limits.maximumZoom)
    && limits.maximumZoom > 0
    ? limits.maximumZoom
    : DEFAULT_MAXIMUM_ZOOM
  return { minimum, maximum: Math.max(minimum, requestedMaximum) }
}

export function fitViewport(
  bounds: Rect,
  viewport: Size,
  padding = 48,
  limits: ViewportLimits = {},
): ViewportTransform {
  const { minimum, maximum } = zoomLimits(limits)
  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0)
  const availableWidth = Math.max(1, viewport.width - safePadding * 2)
  const availableHeight = Math.max(1, viewport.height - safePadding * 2)
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const zoom = clamp(Math.min(availableWidth / width, availableHeight / height), minimum, maximum)
  return {
    x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  }
}

export function screenPointToWorld(point: Point, transform: ViewportTransform): Point {
  const zoom = transform.zoom > 0 ? transform.zoom : 1
  return {
    x: (point.x - transform.x) / zoom,
    y: (point.y - transform.y) / zoom,
  }
}

export function worldPointToScreen(point: Point, transform: ViewportTransform): Point {
  return {
    x: point.x * transform.zoom + transform.x,
    y: point.y * transform.zoom + transform.y,
  }
}

export function visibleWorldRect(transform: ViewportTransform, viewport: Size): Rect {
  const topLeft = screenPointToWorld({ x: 0, y: 0 }, transform)
  const bottomRight = screenPointToWorld({ x: viewport.width, y: viewport.height }, transform)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
}

export function panViewport(
  transform: ViewportTransform,
  screenDelta: Point,
): ViewportTransform {
  return {
    x: transform.x + screenDelta.x,
    y: transform.y + screenDelta.y,
    zoom: transform.zoom,
  }
}

export function zoomViewportAt(
  transform: ViewportTransform,
  screenPoint: Point,
  requestedZoom: number,
  limits: ViewportLimits = {},
): ViewportTransform {
  const { minimum, maximum } = zoomLimits(limits)
  const zoom = clamp(requestedZoom, minimum, maximum)
  const worldPoint = screenPointToWorld(screenPoint, transform)
  return {
    x: screenPoint.x - worldPoint.x * zoom,
    y: screenPoint.y - worldPoint.y * zoom,
    zoom,
  }
}

export function centerViewportOn(
  transform: ViewportTransform,
  viewport: Size,
  worldPoint: Point,
): ViewportTransform {
  return {
    x: viewport.width / 2 - worldPoint.x * transform.zoom,
    y: viewport.height / 2 - worldPoint.y * transform.zoom,
    zoom: transform.zoom,
  }
}
