import type { BranchRecord } from '../shared/types.ts'
import type { TreeMetadataRepository } from './storage.ts'

export type BranchSessionCleanupMode = 'delete'

export interface BranchSessionCleanupPort {
  readonly mode: BranchSessionCleanupMode
  cancel(sessionId: string): Promise<void>
  cleanup(sessionId: string): Promise<void>
}

export class BranchDeletionError extends Error {
  constructor(
    readonly code: 'branch-not-found' | 'branch-cycle' | 'cancel-failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BranchDeletionError'
  }
}

export interface CascadeDeletionPlan {
  treeId: string
  targetBranchId: string
  /** Children precede parents so every destructive phase runs bottom-up. */
  branches: readonly BranchRecord[]
  branchCount: number
  visibleMessageCount: number
}

export type CascadeDeletionResult =
  | {
    status: 'deleted'
    branchCount: number
    visibleMessageCount: number
    cleanupMode: BranchSessionCleanupMode
  }
  | {
    status: 'already-absent'
    branchCount: 0
    visibleMessageCount: 0
    cleanupMode: BranchSessionCleanupMode
  }
  | {
    status: 'cleanup-pending'
    branchCount: number
    visibleMessageCount: number
    cleanupMode: BranchSessionCleanupMode
    failedSessionId: string
    message: string
  }

/** Determine the exact descendant set and bottom-up order before mutating it. */
export function planCascadeDeletion(
  records: readonly BranchRecord[],
  treeId: string,
  targetBranchId: string,
  visibleMessagesByBranch: ReadonlyMap<string, number> = new Map(),
): CascadeDeletionPlan {
  const inTree = records.filter(record => record.treeId === treeId)
  const byId = new Map(inTree.map(record => [record.branchId, record] as const))
  const target = byId.get(targetBranchId)
  if (target === undefined) {
    throw new BranchDeletionError(
      'branch-not-found',
      `branch '${targetBranchId}' does not exist in tree '${treeId}'`,
    )
  }
  const children = new Map<string, BranchRecord[]>()
  for (const record of inTree) {
    if (record.parentBranchId === null) continue
    const bucket = children.get(record.parentBranchId) ?? []
    bucket.push(record)
    children.set(record.parentBranchId, bucket)
  }
  for (const bucket of children.values()) {
    bucket.sort((left, right) => left.createdAt - right.createdAt || left.branchId.localeCompare(right.branchId))
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const ordered: BranchRecord[] = []
  const visit = (record: BranchRecord): void => {
    if (visited.has(record.branchId)) return
    if (visiting.has(record.branchId)) {
      throw new BranchDeletionError(
        'branch-cycle',
        `branch '${record.branchId}' participates in a parent cycle`,
      )
    }
    visiting.add(record.branchId)
    for (const child of children.get(record.branchId) ?? []) visit(child)
    visiting.delete(record.branchId)
    visited.add(record.branchId)
    ordered.push(record)
  }
  visit(target)

  return Object.freeze({
    treeId,
    targetBranchId,
    branches: Object.freeze(ordered),
    branchCount: ordered.length,
    visibleMessageCount: ordered.reduce(
      (total, record) => total + (visibleMessagesByBranch.get(record.branchId) ?? 0),
      0,
    ),
  })
}

/** Two-phase branch deletion: mark the full subtree, then clean its sessions. */
export class CascadeDeleteCoordinator {
  constructor(
    private readonly repository: TreeMetadataRepository,
    private readonly sessions: BranchSessionCleanupPort,
    private readonly now: () => number = Date.now,
  ) {}

  async delete(
    treeId: string,
    targetBranchId: string,
    visibleMessagesByBranch: ReadonlyMap<string, number> = new Map(),
  ): Promise<CascadeDeletionResult> {
    const records = this.repository.listBranches(treeId)
    if (!records.some(record => record.branchId === targetBranchId)) {
      return {
        status: 'already-absent',
        branchCount: 0,
        visibleMessageCount: 0,
        cleanupMode: this.sessions.mode,
      }
    }
    const plan = planCascadeDeletion(records, treeId, targetBranchId, visibleMessagesByBranch)

    for (const branch of plan.branches) {
      if (branch.status !== 'creating' && branch.status !== 'running') continue
      try {
        await this.sessions.cancel(branch.sessionId)
      } catch (error: unknown) {
        throw new BranchDeletionError(
          'cancel-failed',
          `failed to cancel branch session '${branch.sessionId}'`,
          { cause: error },
        )
      }
    }

    const deletedAt = this.now()
    for (const branch of plan.branches) {
      await this.repository.putBranch({
        ...branch,
        status: 'deleted',
        deletedAt: branch.deletedAt ?? deletedAt,
      })
    }

    for (const branch of plan.branches) {
      try {
        await this.sessions.cleanup(branch.sessionId)
      } catch (error: unknown) {
        return {
          status: 'cleanup-pending',
          branchCount: plan.branchCount,
          visibleMessageCount: plan.visibleMessageCount,
          cleanupMode: this.sessions.mode,
          failedSessionId: branch.sessionId,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    for (const branch of plan.branches) {
      await this.repository.deleteBranchRecord(branch.branchId)
    }
    return {
      status: 'deleted',
      branchCount: plan.branchCount,
      visibleMessageCount: plan.visibleMessageCount,
      cleanupMode: this.sessions.mode,
    }
  }
}
