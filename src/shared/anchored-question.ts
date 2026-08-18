import type { AnchorRange } from './types.ts'

function markdownQuote(text: string): string {
  return text
    .split(/\r\n|\r|\n/gu)
    .map(line => `> ${line}`)
    .join('\n')
}

/** Build the durable user message sent to a branch for a text-range follow-up. */
export function formatAnchoredQuestion(question: string, range?: AnchorRange): string {
  if (range === undefined) return question
  return `${markdownQuote(range.text)}\n\n${question}`
}

/** Recover the visible question from a prompt created by formatAnchoredQuestion. */
export function extractAnchoredQuestion(message: string, range?: AnchorRange): string {
  if (range === undefined) return message
  const prefix = `${markdownQuote(range.text)}\n\n`
  return message.startsWith(prefix) ? message.slice(prefix.length) : message
}
