import type { KvTable } from '@deepseek-ai/dsh-storage-domain'

import { branchRecordSchema, treeRecordSchema } from '../shared/schema.ts'
import type { BranchRecord, TreeRecord } from '../shared/types.ts'

function freezeTree(record: TreeRecord): TreeRecord {
  return Object.freeze(treeRecordSchema.parse(record))
}

function freezeBranch(record: BranchRecord): BranchRecord {
  const parsed = branchRecordSchema.parse(record)
  if (parsed.anchorRange !== undefined) Object.freeze(parsed.anchorRange)
  return Object.freeze(parsed)
}

/** Typed repository over the plugin's two storage-domain tables. */
export class TreeMetadataRepository {
  constructor(
    private readonly trees: KvTable<string, TreeRecord>,
    private readonly branches: KvTable<string, BranchRecord>,
  ) {}

  getTreeByRootSession(rootSessionId: string): TreeRecord | undefined {
    return this.trees.get(rootSessionId)
  }

  getTree(treeId: string): TreeRecord | undefined {
    for (const tree of this.trees.entries()) {
      if (tree[1].treeId === treeId) return tree[1]
    }
    return undefined
  }

  listTrees(): readonly TreeRecord[] {
    return Object.freeze(
      [...this.trees.entries()]
        .map(entry => entry[1])
        .sort((left, right) => left.createdAt - right.createdAt || left.treeId.localeCompare(right.treeId)),
    )
  }

  async putTree(record: TreeRecord): Promise<TreeRecord> {
    const next = freezeTree(record)
    const existingAtRoot = this.trees.get(next.rootSessionId)
    if (existingAtRoot !== undefined && existingAtRoot.treeId !== next.treeId) {
      throw new Error(`root session '${next.rootSessionId}' already owns another conversation tree`)
    }
    const existingAtId = this.getTree(next.treeId)
    if (existingAtId !== undefined && existingAtId.rootSessionId !== next.rootSessionId) {
      throw new Error(`conversation tree '${next.treeId}' is already owned by another root session`)
    }
    await this.trees.put(next.rootSessionId, next)
    return next
  }

  getBranch(branchId: string): BranchRecord | undefined {
    return this.branches.get(branchId)
  }

  getBranchBySession(sessionId: string): BranchRecord | undefined {
    for (const entry of this.branches.entries()) {
      if (entry[1].sessionId === sessionId) return entry[1]
    }
    return undefined
  }

  listBranches(treeId: string): readonly BranchRecord[] {
    return Object.freeze(
      [...this.branches.entries()]
        .map(entry => entry[1])
        .filter(branch => branch.treeId === treeId)
        .sort((left, right) => left.createdAt - right.createdAt || left.branchId.localeCompare(right.branchId)),
    )
  }

  async putBranch(record: BranchRecord): Promise<BranchRecord> {
    const next = freezeBranch(record)
    if (this.getTree(next.treeId) === undefined) {
      throw new Error(`conversation tree '${next.treeId}' does not exist`)
    }
    if (next.parentBranchId === next.branchId) {
      throw new Error(`branch '${next.branchId}' cannot be its own parent`)
    }
    if (next.parentBranchId !== null) {
      const parent = this.branches.get(next.parentBranchId)
      if (parent === undefined || parent.treeId !== next.treeId) {
        throw new Error(`parent branch '${next.parentBranchId}' does not exist in tree '${next.treeId}'`)
      }
      if (parent.sessionId !== next.parentSessionId) {
        throw new Error(`branch '${next.branchId}' source session does not match its parent branch`)
      }
    }
    const existingAtSession = this.getBranchBySession(next.sessionId)
    if (existingAtSession !== undefined && existingAtSession.branchId !== next.branchId) {
      throw new Error(`session '${next.sessionId}' already belongs to another branch`)
    }
    const existing = this.branches.get(next.branchId)
    if (existing !== undefined
      && (existing.treeId !== next.treeId || existing.sessionId !== next.sessionId)) {
      throw new Error(`branch '${next.branchId}' cannot change tree or session identity`)
    }
    await this.branches.put(next.branchId, next)
    return next
  }

  nextSiblingOrdinal(
    treeId: string,
    parentBranchId: string | null,
    anchorSessionId: string,
    anchorMessageId: string,
  ): number {
    let maximum = 0
    for (const branch of this.listBranches(treeId)) {
      if (branch.parentBranchId === parentBranchId
        && branch.anchorSessionId === anchorSessionId
        && branch.anchorMessageId === anchorMessageId) {
        maximum = Math.max(maximum, branch.siblingOrdinal)
      }
    }
    return maximum + 1
  }

  deleteBranchRecord(branchId: string): Promise<boolean> {
    return this.branches.delete(branchId)
  }
}
