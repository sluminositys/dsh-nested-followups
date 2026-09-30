import type { ComponentType, ReactNode } from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

interface IconProps { readonly size?: number | undefined; readonly className?: string | undefined }
const exports = primitives as unknown as Record<string, unknown>

/** DSH 0.2 names icons by weight instead of their default size. */
export function resolveNativeIcon(module: Readonly<Record<string, unknown>>, legacy: string, current: string): ComponentType<IconProps> {
  const icon = Object.hasOwn(module, current) ? module[current]
    : Object.hasOwn(module, legacy) ? module[legacy] : undefined
  return (icon ?? (() => null)) as ComponentType<IconProps>
}

export const IconBranchOutline16 = resolveNativeIcon(exports, 'IconBranchOutline16', 'IconBranchOutlineRegular')
export const IconChevronUpOutline14 = resolveNativeIcon(exports, 'IconChevronUpOutline14', 'IconChevronUpOutlineRegular')
export const IconChevronDownOutline14 = resolveNativeIcon(exports, 'IconChevronDownOutline14', 'IconChevronDownOutlineRegular')
export const IconCloseOutline16 = resolveNativeIcon(exports, 'IconCloseOutline16', 'IconCloseOutlineRegular')
export const IconSearchOutline16 = resolveNativeIcon(exports, 'IconSearchOutline16', 'IconSearchOutlineRegular')
export const IconInspectOutline12 = resolveNativeIcon(exports, 'IconInspectOutline12', 'IconInspectOutlineRegular')
export const IconPlusOutline16 = resolveNativeIcon(exports, 'IconPlusOutline16', 'IconPlusOutlineRegular')
export const IconTrashOutline16 = resolveNativeIcon(exports, 'IconTrashOutline16', 'IconTrashOutlineRegular')

/** Reuse the native user-text projection after MessageText's removal in 0.2. */
export function MessageText({ text }: { readonly text: string }): ReactNode {
  const LegacyMessageText = (Object.hasOwn(exports, 'MessageText') ? exports['MessageText'] : undefined) as ComponentType<{ readonly text: string }> | undefined
  if (LegacyMessageText !== undefined) return <LegacyMessageText text={text} />
  const project = exports['projectUserText'] as ((text: string, sessionLabels: readonly string[]) => ReactNode) | undefined
  return <div style={{ whiteSpace: 'pre-wrap' }}>{project?.(text, []) ?? text}</div>
}
