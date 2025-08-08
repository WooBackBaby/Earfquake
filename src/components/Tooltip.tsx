import { format } from 'date-fns'

interface TooltipProps {
  visible: boolean
  x: number
  y: number
  mag: number
  place: string
  time: number
  depthKm: number
}

export function Tooltip({ visible, x, y, mag, place, time, depthKm }: TooltipProps) {
  if (!visible) return null
  return (
    <div
      role="dialog"
      aria-live="polite"
      className="pointer-events-none fixed z-50 w-64 rounded-md border border-muted bg-bg/95 p-3 shadow-lg backdrop-blur"
      style={{ left: x + 12, top: y + 12 }}
    >
      <div className="mb-1 text-sm font-semibold">M {mag.toFixed(1)}</div>
      <div className="text-sm opacity-80">{place}</div>
      <div className="mt-1 text-xs opacity-70">{format(time, 'PPpp')}</div>
      <div className="text-xs opacity-70">Depth: {depthKm.toFixed(1)} km</div>
    </div>
  )
}


