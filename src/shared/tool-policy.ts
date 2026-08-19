/**
 * Which tools a read-only branch may actually execute.
 *
 * Dependency-free so both the Host execution guard and the tree projection's
 * defence-in-depth diagnostic classify a tool name the same way.
 *
 * Classification follows the upstream tool catalog's "Writes / affects" column.
 * A package contributing both readers and mutators is listed member by member,
 * and anything unlisted is denied, so a newly composed tool is never allowed by
 * omission.
 */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = Object.freeze(new Set([
  // @deepseek-ai/dsh-tool-fs
  'read',
  'read_image',
  // @deepseek-ai/dsh-tool-fs-search
  'glob',
  'grep',
  // @deepseek-ai/dsh-tool-lsp
  'lsp',
  // @deepseek-ai/dsh-tool-session-query
  'session_event_read',
  'session_event_search',
  'session_event_trace',
  'session_search',
  'session_trace',
  // @deepseek-ai/dsh-tool-jobs — readers only; job_kill mutates
  'job_list',
  'job_output',
  // @deepseek-ai/dsh-tool-terminal — readers only; open/close/send/signal mutate
  'terminal_list',
  'terminal_read',
  // @deepseek-ai/dsh-tool-subagent-control — reader only
  'list_agents',
  // @deepseek-ai/dsh-tool-goal — reader only
  'get_goal',
]))

/**
 * Code Mode's reserved transport.
 *
 * `run_code` mutates nothing itself, and every binding a program calls
 * re-enters the guarded pipeline carrying the same agent, so each nested read
 * stays allowed and each nested mutation is denied by the same guard. Denying
 * the transport would instead remove reads from Code Mode deployments without
 * preventing anything.
 */
export const TRANSPORT_TOOL_NAMES: ReadonlySet<string> = Object.freeze(new Set(['run_code']))

/** Whether a branch may execute this tool. */
export function isBranchExecutableTool(name: string): boolean {
  return TRANSPORT_TOOL_NAMES.has(name) || READ_ONLY_TOOL_NAMES.has(name)
}
