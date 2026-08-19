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

/** One quote the user captured from a message before branching. */
export interface SavedQuote {
  readonly id: string
  readonly text: string
  readonly note: string
}

/**
 * Locate a captured quote inside the persisted Markdown source. Only an
 * unambiguous match may become a durable anchor range; zero or several
 * occurrences return undefined and the quote travels as prompt text only.
 */
export function locateQuoteRange(source: string, quote: string): AnchorRange | undefined {
  if (quote.length === 0) return undefined
  const first = source.indexOf(quote)
  if (first === -1) return undefined
  if (source.indexOf(quote, first + 1) !== -1) return undefined
  return { start: first, end: first + quote.length, text: quote }
}

/**
 * Compose the outgoing question from captured quotes plus the typed draft.
 *
 * The first pure quote may be delegated to the Host's anchorRange formatting
 * (which prepends the same Markdown blockquote), so it is skipped here when
 * `skipFirst` is set; every other quote and every note travels inline.
 */
export function composeQuotedQuestion(
  quotes: readonly SavedQuote[],
  draft: string,
  skipFirst: boolean,
): string {
  const blocks = quotes
    .filter((_quote, index) => !(skipFirst && index === 0))
    .map(quote => quote.note.trim() === ''
      ? markdownQuote(quote.text)
      : markdownQuote(quote.text) + '\n\n' + quote.note.trim())
  return [...blocks, draft].filter(part => part.trim() !== '').join('\n\n')
}
