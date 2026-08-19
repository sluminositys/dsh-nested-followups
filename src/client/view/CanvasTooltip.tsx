import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import css from './ConversationTreeCanvas.module.css'

interface TooltipPosition {
  readonly left: number
  readonly top: number
  readonly above: boolean
}

/**
 * Tooltip for elements inside the transformed canvas.
 *
 * The shared DSH Tooltip renders its bubble in place with `position: fixed`
 * and no portal. Inside the tree canvas that breaks: the pan/zoom layer's CSS
 * transform makes that layer the containing block for fixed descendants, so
 * viewport coordinates get reinterpreted in world space and the bubble lands
 * far from its anchor. Rendering through a portal to `document.body` keeps
 * the bubble in the real viewport coordinate system.
 */
export function CanvasTooltip({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactElement<Record<string, unknown>>
}) {
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const anchorRef = useRef<Element | null>(null)

  const show = (target: Element): void => {
    anchorRef.current = target
    const rect = target.getBoundingClientRect()
    const above = rect.top > 44
    setPosition({
      left: rect.left + rect.width / 2,
      top: above ? rect.top - 6 : rect.bottom + 6,
      above,
    })
  }
  const hide = (): void => {
    anchorRef.current = null
    setPosition(null)
  }

  useEffect(() => {
    if (position === null) return
    const reposition = (): void => {
      const anchor = anchorRef.current
      if (anchor === null || !anchor.isConnected) {
        setPosition(null)
        return
      }
      show(anchor)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition reads refs only
  }, [position === null])

  const child = children
  const merged = cloneElement(child, {
    onMouseEnter: (event: MouseEvent & { currentTarget: Element }) => {
      ;(child.props.onMouseEnter as ((e: unknown) => void) | undefined)?.(event)
      show(event.currentTarget)
    },
    onMouseLeave: (event: unknown) => {
      ;(child.props.onMouseLeave as ((e: unknown) => void) | undefined)?.(event)
      hide()
    },
    onFocus: (event: FocusEvent & { currentTarget: Element }) => {
      ;(child.props.onFocus as ((e: unknown) => void) | undefined)?.(event)
      show(event.currentTarget)
    },
    onBlur: (event: unknown) => {
      ;(child.props.onBlur as ((e: unknown) => void) | undefined)?.(event)
      hide()
    },
    onClick: (event: unknown) => {
      ;(child.props.onClick as ((e: unknown) => void) | undefined)?.(event)
      hide()
    },
  })

  return (
    <>
      {merged}
      {position !== null && typeof document !== 'undefined' && createPortal(
        <span
          className={css.canvasTooltip}
          role="tooltip"
          data-above={position.above || undefined}
          style={{ left: position.left, top: position.top }}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  )
}
