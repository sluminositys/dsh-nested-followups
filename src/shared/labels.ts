import type { MessageNodeView } from './types.ts'

/** Human-readable card address. It is never used as data identity. */
export function displayLabelOf(node: MessageNodeView): string {
  const prefix = node.role === 'user' ? 'Q' : 'A'
  const path = node.branchPath.map(part => part === 0 ? '?' : String(part)).join('.')
  if (node.branchId === null || node.localTurnIndex === 1) return `${prefix}${path}`
  return `${prefix}${path} #${node.localTurnIndex}`
}
