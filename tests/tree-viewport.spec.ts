import { describe, expect, it } from 'vitest'

import { centerOf } from '../src/client/tree/geometry.ts'
import { layoutConversationTree } from '../src/client/tree/layout.ts'
import {
  createMinimapModel,
  minimapPointToWorld,
  navigateFromMinimap,
} from '../src/client/tree/minimap.ts'
import {
  fitViewport,
  isWorldRectVisible,
  screenPointToWorld,
  worldPointToScreen,
  zoomViewportAt,
} from '../src/client/tree/viewport.ts'
import { treeProjectionFixture } from './fixtures/tree-projection.ts'

describe('tree viewport and minimap', () => {
  it('fits world bounds into the padded viewport with clamped zoom', () => {
    expect(fitViewport(
      { x: 100, y: 50, width: 1_000, height: 500 },
      { width: 500, height: 300 },
      50,
    )).toEqual({ x: 10, y: 30, zoom: 0.4 })

    expect(fitViewport(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 1_000, height: 1_000 },
      0,
    ).zoom).toBe(2)
  })

  it('keeps the world point under the pointer fixed while zooming', () => {
    const before = { x: 20, y: -10, zoom: 0.5 }
    const pointer = { x: 240, y: 160 }
    const world = screenPointToWorld(pointer, before)
    const after = zoomViewportAt(before, pointer, 1.25)

    expect(worldPointToScreen(world, after).x).toBeCloseTo(pointer.x)
    expect(worldPointToScreen(world, after).y).toBeCloseTo(pointer.y)
  })

  it('detects whether a generated card remains inside the usable viewport', () => {
    const viewport = { width: 800, height: 600 }
    const transform = { x: 0, y: 0, zoom: 1 }

    expect(isWorldRectVisible(
      { x: 100, y: 100, width: 280, height: 120 },
      transform,
      viewport,
    )).toBe(true)
    expect(isWorldRectVisible(
      { x: 700, y: 100, width: 280, height: 120 },
      transform,
      viewport,
    )).toBe(false)
    expect(isWorldRectVisible(
      { x: -100, y: 100, width: 1_000, height: 120 },
      transform,
      viewport,
    )).toBe(true)
  })

  it('projects simplified geometry and centers navigation from a minimap click', () => {
    const layout = layoutConversationTree(treeProjectionFixture())
    const viewportSize = { width: 900, height: 600 }
    const transform = fitViewport(layout.bounds, viewportSize)
    const model = createMinimapModel(
      layout,
      transform,
      viewportSize,
      { width: 220, height: 140 },
    )
    const minimapCenter = centerOf({ x: 0, y: 0, width: 220, height: 140 })
    const world = minimapPointToWorld(model, minimapCenter)
    const navigated = navigateFromMinimap(model, minimapCenter, transform, viewportSize)

    expect(model.nodes).toHaveLength(layout.nodes.length)
    expect(model.edges).toHaveLength(layout.edges.length)
    expect(model.nodes.every(node => node.rect.x >= 0 && node.rect.y >= 0)).toBe(true)
    expect(world.x).toBeCloseTo(layout.bounds.x + layout.bounds.width / 2)
    expect(world.y).toBeCloseTo(layout.bounds.y + layout.bounds.height / 2)
    expect(worldPointToScreen(world, navigated)).toEqual({ x: 450, y: 300 })
  })
})
