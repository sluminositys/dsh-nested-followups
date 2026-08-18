import type { PointerEvent } from 'react'
import type { MinimapModel } from '../tree/minimap.ts'
import type { Point } from '../tree/geometry.ts'
import css from './ConversationTreeCanvas.module.css'

export interface TreeMinimapProps {
  readonly model: MinimapModel
  readonly label: string
  readonly onNavigate: (point: Point) => void
}

function localPoint(event: PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

export function TreeMinimap({ model, label, onNavigate }: TreeMinimapProps) {
  const navigate = (event: PointerEvent<SVGSVGElement>): void => {
    onNavigate(localPoint(event))
  }
  return (
    <svg
      className={css.minimap}
      width={model.size.width}
      height={model.size.height}
      viewBox={`0 0 ${model.size.width} ${model.size.height}`}
      role="application"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        navigate(event)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        navigate(event)
      }}
    >
      {model.edges.map(edge => (
        <line
          key={edge.edgeId}
          className={css.minimapEdge}
          data-kind={edge.kind}
          x1={edge.start.x}
          y1={edge.start.y}
          x2={edge.end.x}
          y2={edge.end.y}
        />
      ))}
      {model.nodes.map(node => (
        <rect
          key={node.nodeId}
          className={css.minimapNode}
          data-root={node.branchId === null || undefined}
          x={node.rect.x}
          y={node.rect.y}
          width={Math.max(2, node.rect.width)}
          height={Math.max(2, node.rect.height)}
          rx={1}
        />
      ))}
      <rect
        className={css.minimapViewport}
        x={model.viewportRect.x}
        y={model.viewportRect.y}
        width={model.viewportRect.width}
        height={model.viewportRect.height}
      />
    </svg>
  )
}
