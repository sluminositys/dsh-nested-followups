import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { deriveContextPreview, type ContextPreview } from '../src/client/tree/context-preview.ts'
import type { ConversationTreeProjection } from '../src/shared/projection.ts'
import { largeContextPreviewProjectionFixture } from './fixtures/large-context-preview.ts'

const cases = [
  { rootTurns: 25, depth: 5, nodeCount: 200 },
  { rootTurns: 250, depth: 50, nodeCount: 2_000 },
]

function expectPartition(
  projection: ConversationTreeProjection,
  preview: ContextPreview | undefined,
  inheritedCount: number,
): void {
  expect(preview?.boundary.eligible).toBe(true)
  expect(preview?.summary).toEqual({
    inheritedMessageCount: inheritedCount,
    excludedMessageCount: projection.nodes.length - inheritedCount,
  })
  expect(preview?.inheritedNodeIds).toHaveLength(inheritedCount)
  expect(preview?.inheritedEdgeIds).toHaveLength(inheritedCount - 1)
  const partition = [
    ...(preview?.inheritedNodeIds ?? []),
    ...(preview?.excludedGroups.flatMap(group => group.nodeIds) ?? []),
  ]
  expect(partition).toHaveLength(projection.nodes.length)
  expect(new Set(partition)).toEqual(new Set(projection.nodes.map(node => node.nodeId)))
}

function median(samples: readonly number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)] ?? Infinity
}

describe.each(cases)('context derivation budget ($nodeCount messages, $depth levels)', ({
  rootTurns,
  depth,
  nodeCount,
}) => {
  it('partitions inherited context and all four exclusion groups at large scale', () => {
    const projection = largeContextPreviewProjectionFixture(rootTurns, depth)
    const level = Math.ceil(depth / 2)
    const preview = deriveContextPreview(projection, `branch-${level}-1:assistant:1`)

    expect(projection.nodes).toHaveLength(nodeCount)
    expect(projection.edges).toHaveLength(nodeCount - 1)
    expect(projection.branches).toHaveLength(depth * 5)
    expectPartition(projection, preview, 2 + level * 2)
    expect(preview?.inheritedNodeIds).toEqual([
      'root:user:1', 'root:assistant:1',
      ...Array.from({ length: level }, (_, index) => [
        `branch-${index + 1}-1:user:1`,
        `branch-${index + 1}-1:assistant:1`,
      ]).flat(),
    ])
    expect(preview?.excludedGroups.map(group => [group.reason, group.nodeIds.length])).toEqual([
      ['root-session-tail', rootTurns * 2 - 2],
      ['current-branch-tail', level * 4],
      ['sibling-branch', level * 4 * 6],
      ['descendant-branch', (depth - level) * 5 * 6],
    ])
  })

  it('bounds source-node reads for cold and cached derivations', () => {
    const fixture = largeContextPreviewProjectionFixture(rootTurns, depth)
    let reads = 0
    // Count input work without relying on CPU speed. This catches a return to
    // repeated full-node scans along the ancestor path even on a fast runner.
    const projection = {
      ...fixture,
      nodes: fixture.nodes.map(node => new Proxy(node, {
        get(target, property, receiver) {
          reads += 1
          return Reflect.get(target, property, receiver)
        },
      })),
    }
    const target = `branch-${depth}-1:assistant:1`
    const cold = deriveContextPreview(projection, target)
    const coldReads = reads
    reads = 0
    const cached = deriveContextPreview(projection, target)
    const cachedReads = reads

    // Allow several indexing/grouping passes plus sorting. Bounds scale with
    // message count, not depth; elapsed-time checks below also cover work that
    // does not read source-node properties.
    expect(coldReads).toBeLessThanOrEqual(nodeCount * 100)
    expect(cachedReads).toBeLessThanOrEqual(nodeCount * 60)
    expect(cachedReads).toBeLessThan(coldReads)
    expect(cached).toEqual(cold)
    expectPartition(projection, cached, 2 + depth * 2)
  })

  it('keeps cold creation and repeated selections within the elapsed-time budget', () => {
    const projection = largeContextPreviewProjectionFixture(rootTurns, depth)
    const targets = [
      { id: 'root:assistant:1', inherited: 2 },
      { id: `branch-${Math.ceil(depth / 2)}-1:assistant:1`, inherited: 2 + Math.ceil(depth / 2) * 2 },
      { id: `branch-${depth}-1:assistant:1`, inherited: 2 + depth * 2 },
    ]
    const deepest = targets[2]
    if (deepest === undefined) throw new Error('fixture is missing the deepest target')

    // Warm the JS code and the reusable snapshot outside the measured window.
    // A new projection identity below still forces cold indexing each time.
    for (const target of targets) deriveContextPreview(projection, target.id)
    const coldSamples: number[] = []
    const selectionSamples: number[] = []
    for (let sample = 0; sample < 7; sample += 1) {
      const freshSnapshot = { ...projection }
      const coldStart = performance.now()
      const cold = deriveContextPreview(freshSnapshot, deepest.id)
      coldSamples.push(performance.now() - coldStart)

      const selectionStart = performance.now()
      const selections = targets.map(target => deriveContextPreview(projection, target.id))
      selectionSamples.push(performance.now() - selectionStart)

      // Fixture creation and assertions are deliberately excluded from timing.
      expectPartition(projection, cold, deepest.inherited)
      targets.forEach((target, index) => expectPartition(projection, selections[index], target.inherited))
    }

    // Coarse regression limits, not a browser frame-rate claim. Medians avoid
    // failing on one GC pause or a busy CI worker. The read budget above keeps
    // these deliberately generous time limits from hiding repeated scans.
    expect(median(coldSamples), 'cold index plus one preview (ms)').toBeLessThan(100)
    expect(median(selectionSamples), 'three cached preview selections (ms)').toBeLessThan(150)
  })
})
