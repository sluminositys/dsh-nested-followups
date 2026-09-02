import { describe, expect, it } from 'vitest'
import { buildProjectionGraphIndex } from '../src/client/tree/projection-graph.ts'
import { nestedContextPreviewProjectionFixture } from './fixtures/context-preview.ts'

describe('projection graph index', () => {
  it('provides stable identity lookups without copying projection records', () => {
    const projection = nestedContextPreviewProjectionFixture()
    const graph = buildProjectionGraphIndex(projection)

    expect(graph.projection).toBe(projection)
    expect([...graph.nodesById.keys()]).toEqual(projection.nodes.map(node => node.nodeId))
    expect([...graph.edgesById.keys()]).toEqual(projection.edges.map(edge => edge.edgeId))
    expect([...graph.branchesById.keys()]).toEqual(
      projection.branches.map(branch => branch.record.branchId),
    )
    expect(graph.nodesById.get('branch-1-a2')).toBe(
      projection.nodes.find(node => node.nodeId === 'branch-1-a2'),
    )
    expect(graph.branchesById.get('branch-1-1')).toBe(
      projection.branches.find(branch => branch.record.branchId === 'branch-1-1'),
    )
    expect(Object.isFrozen(graph)).toBe(true)
  })

  it('indexes incoming and outgoing edges in projection order', () => {
    const projection = nestedContextPreviewProjectionFixture()
    const graph = buildProjectionGraphIndex(projection)

    expect(graph.incomingEdgesByNodeId.get('root-a2')?.map(edge => edge.edgeId)).toEqual([
      'sequence:root-q2:root-a2',
    ])
    expect(graph.outgoingEdgesByNodeId.get('root-a2')?.map(edge => edge.edgeId)).toEqual([
      'sequence:root-a2:root-q3',
      'branch:root-a2:branch-1-q',
      'branch:root-a2:branch-2-q',
    ])
    expect(graph.outgoingEdgesByNodeId.get('branch-1-a')?.map(edge => edge.edgeId)).toEqual([
      'branch:branch-1-a:nested-q',
      'sequence:branch-1-a:branch-1-q2',
    ])
    expect(graph.outgoingEdgesByNodeId.get('branch-1-a2')).toEqual([])
    expect(Object.isFrozen(graph.incomingEdgesByNodeId.get('root-a2'))).toBe(true)
    expect(Object.isFrozen(graph.outgoingEdgesByNodeId.get('branch-1-a2'))).toBe(true)
  })
})
