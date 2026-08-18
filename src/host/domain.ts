import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

import { branchRecordSchema, treeRecordSchema } from '../shared/schema.ts'
import type { BranchRecord, TreeRecord } from '../shared/types.ts'

/** Plugin-owned sidecar data. Session logs remain unchanged. */
export const nestedFollowupsDomainSpec = defineDomain({
  name: 'nested_followups',
  version: 0,
  tables: {
    trees: domainTable<string, TreeRecord>(treeRecordSchema),
    branches: domainTable<string, BranchRecord>(branchRecordSchema),
  },
})
