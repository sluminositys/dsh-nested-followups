import { describe, expect, it } from 'vitest'
import { deriveContextPreview } from '../src/client/tree/context-preview.ts'
import { deriveFocusState } from '../src/client/tree/navigation.ts'
import { buildProjectionGraphIndex, getProjectionGraphIndex } from '../src/client/tree/projection-graph.ts'
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

  it('indexes branch lineage and anchor relationships in projection order', () => {
    const projection = nestedContextPreviewProjectionFixture()
    const graph = buildProjectionGraphIndex(projection)
    const branchOne = graph.branchesById.get('branch-1')
    const rootAnswer = graph.nodesById.get('root-a2')

    expect(graph.parentBranchesByBranchId.get('branch-1-1')).toBe(branchOne)
    expect(graph.parentBranchesByBranchId.has('branch-1')).toBe(false)
    expect(graph.childBranchesByParentBranchId.get(null)?.map(
      branch => branch.record.branchId,
    )).toEqual(['branch-2', 'branch-1'])
    expect(graph.childBranchesByParentBranchId.get('branch-1')?.map(
      branch => branch.record.branchId,
    )).toEqual(['branch-1-1'])
    expect(graph.childBranchesByParentBranchId.get('branch-1-1')).toEqual([])

    expect(graph.anchorNodesByBranchId.get('branch-1')).toBe(rootAnswer)
    expect(graph.anchorNodesByBranchId.get('branch-2')).toBe(rootAnswer)
    expect(graph.anchorNodesByBranchId.get('branch-1-1')).toBe(
      graph.nodesById.get('branch-1-a'),
    )
    expect(graph.branchesByAnchorNodeId.get('root-a2')?.map(
      branch => branch.record.branchId,
    )).toEqual(['branch-2', 'branch-1'])
    expect(graph.branchesByAnchorNodeId.get('branch-1-a')?.map(
      branch => branch.record.branchId,
    )).toEqual(['branch-1-1'])
    expect(graph.branchesByAnchorNodeId.get('branch-1-a2')).toEqual([])

    expect(Object.isFrozen(graph.childBranchesByParentBranchId.get('branch-1'))).toBe(true)
    expect(Object.isFrozen(graph.branchesByAnchorNodeId.get('root-a2'))).toBe(true)
  })

  it('indexes deterministic sequence order within each session', () => {
    const fixture = nestedContextPreviewProjectionFixture()
    const branchQuestion = fixture.nodes.find(node => node.nodeId === 'branch-1-q2')
    if (branchQuestion === undefined) throw new Error('context fixture is missing branch turn two')
    const projection = {
      ...fixture,
      nodes: [
        { ...branchQuestion, nodeId: 'tie-z', messageId: 'tie-z' },
        { ...branchQuestion, nodeId: 'tie-a', messageId: 'tie-a' },
        ...fixture.nodes.toReversed(),
      ],
    }
    const graph = buildProjectionGraphIndex(projection)
    const sessionNodes = graph.nodesBySessionId.get('branch-session-1') ?? []

    expect(sessionNodes.map(node => node.nodeId)).toEqual([
      'branch-1-q',
      'branch-1-a',
      'branch-1-q2',
      'tie-a',
      'tie-z',
      'branch-1-a2',
    ])
    expect(sessionNodes[0]).toBe(graph.nodesById.get('branch-1-q'))
    expect(graph.sessionSequenceIndexByNodeId.get('branch-1-q')).toBe(0)
    expect(graph.sessionSequenceIndexByNodeId.get('branch-1-q2')).toBe(2)
    expect(graph.sessionSequenceIndexByNodeId.get('tie-z')).toBe(4)
    expect(graph.sessionSequenceIndexByNodeId.get('branch-1-a2')).toBe(5)
    expect(graph.nodesBySessionId.get('root')?.map(node => node.nodeId)).toEqual([
      'root-q1',
      'root-a1',
      'root-q2',
      'root-a2',
      'root-q3',
      'root-a3',
    ])
    expect(Object.isFrozen(sessionNodes)).toBe(true)
  })

  it('reuses one graph index for the same immutable projection snapshot', () => {
    const projection = Object.freeze(nestedContextPreviewProjectionFixture())
    const graph = getProjectionGraphIndex(projection)

    expect(getProjectionGraphIndex(projection)).toBe(graph)
    expect(getProjectionGraphIndex(projection).nodesBySessionId).toBe(graph.nodesBySessionId)
    expect(graph.projection).toBe(projection)
    expect(Object.isFrozen(graph)).toBe(true)
    expect(graph).toEqual(buildProjectionGraphIndex(projection))
  })

  it('keeps interleaved projection snapshots separate even when all IDs match', () => {
    const first = nestedContextPreviewProjectionFixture()
    const second = structuredClone(first)
    const firstGraph = getProjectionGraphIndex(first)
    const secondGraph = getProjectionGraphIndex(second)

    expect(first.tree.treeId).toBe(second.tree.treeId)
    expect(secondGraph).not.toBe(firstGraph)
    expect(secondGraph.projection).toBe(second)
    expect(secondGraph.nodesById.get('root-a2')).not.toBe(firstGraph.nodesById.get('root-a2'))
    expect(getProjectionGraphIndex(first)).toBe(firstGraph)
    expect(getProjectionGraphIndex(second)).toBe(secondGraph)
  })

  it('refreshes message records and boundary eligibility for a new streaming snapshot', () => {
    const previous = nestedContextPreviewProjectionFixture()
    const previousGraph = getProjectionGraphIndex(previous)
    const streaming = {
      ...previous,
      nodes: previous.nodes.map(node => node.nodeId === 'root-a3'
        ? { ...node, state: 'streaming' as const, text: 'new partial answer' }
        : node),
    }
    const streamingGraph = getProjectionGraphIndex(streaming)

    expect(streaming.nodes).toHaveLength(previous.nodes.length)
    expect(streamingGraph).not.toBe(previousGraph)
    expect(streamingGraph.nodesById.get('root-a3')?.text).toBe('new partial answer')
    expect(deriveContextPreview(streaming, 'root-a3')?.boundary).toEqual({
      eligible: false,
      reason: 'turn-open',
    })
    expect(deriveContextPreview(previous, 'root-a3')?.boundary.eligible).toBe(true)
    expect(getProjectionGraphIndex(previous)).toBe(previousGraph)
  })

  it('refreshes branch and edge lookups after a branch disappears from the next snapshot', () => {
    const previous = nestedContextPreviewProjectionFixture()
    const previousGraph = getProjectionGraphIndex(previous)
    const removedNodeIds = new Set(['nested-q', 'nested-a'])
    const updated = {
      ...previous,
      nodes: previous.nodes.filter(node => !removedNodeIds.has(node.nodeId)),
      branches: previous.branches.filter(branch => branch.record.branchId !== 'branch-1-1'),
      edges: previous.edges.filter(edge => (
        !removedNodeIds.has(edge.sourceNodeId) && !removedNodeIds.has(edge.targetNodeId)
      )),
    }
    const updatedGraph = getProjectionGraphIndex(updated)

    expect(updatedGraph).not.toBe(previousGraph)
    expect(updatedGraph.nodesById.has('nested-a')).toBe(false)
    expect(updatedGraph.branchesById.has('branch-1-1')).toBe(false)
    expect(updatedGraph.childBranchesByParentBranchId.get('branch-1')).toEqual([])
    expect(updatedGraph.outgoingEdgesByNodeId.get('branch-1-a')?.map(edge => edge.edgeId))
      .toEqual(['sequence:branch-1-a:branch-1-q2'])
    expect(deriveContextPreview(updated, 'nested-a')).toBeUndefined()
    expect(deriveFocusState(updated, 'nested-a').active).toBe(false)
    expect(previousGraph.branchesById.has('branch-1-1')).toBe(true)
    expect(previousGraph.nodesById.has('nested-a')).toBe(true)
  })
})
