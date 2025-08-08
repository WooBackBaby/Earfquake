import { useUIStore } from '../stores/useUIStore'
import { useEarthquakes } from '../hooks/useEarthquakes'
import { useMemo, useState } from 'react'

export function Legend() {
  const minMag = useUIStore((s) => s.minMagnitude)
  const setMin = useUIStore((s) => s.setMinMagnitude)
  const ditherScale = useUIStore((s) => s.ditherScale)
  const setDitherScale = useUIStore((s) => s.setDitherScale)
  const setFocusTarget = useUIStore((s) => s.setFocusTarget)
  const { data } = useEarthquakes()
  const [query, setQuery] = useState('')
  const suggestions = useMemo(() => {
    if (!data || !query.trim()) return [] as Array<{ id: string; label: string; lat: number; lng: number }>
    const q = query.toLowerCase()
    return data.features
      .filter((f) => (f.properties.place || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates
        return { id: f.id, label: `${f.properties.place} (M${f.properties.mag ?? '–'})`, lat, lng }
      })
  }, [data, query])

  return (
    <div className="sticky top-3 rounded-lg border border-muted/60 bg-bg/80 p-4 shadow-md backdrop-blur">
      <PanelHeader />
      <div className="mt-4 space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-medium">Search earthquakes</h2>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by place..."
              className="w-full rounded-md border border-muted bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              aria-label="Search earthquakes by place"
              role="combobox"
              aria-expanded={suggestions.length > 0}
            />
            {suggestions.length > 0 && (
              <ul role="listbox" className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-md border border-muted bg-bg/95 text-sm shadow-lg">
                {suggestions.map((s) => (
                  <li role="option" key={s.id}>
                    <button
                      className="w-full px-3 py-2 text-left hover:bg-muted/60"
                      onClick={() => {
                        setFocusTarget(s.lat, s.lng)
                        setQuery('')
                      }}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium">Magnitude filter</h2>
          <input
            type="range"
            min={2.5}
            max={8}
            step={0.1}
            value={minMag}
            onChange={(e) => setMin(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Minimum magnitude"
          />
          <div className="mt-1 text-xs opacity-80">Showing M ≥ {minMag.toFixed(1)}</div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium">Dither strength</h2>
          <input
            type="range"
            min={0.6}
            max={3}
            step={0.1}
            value={ditherScale}
            onChange={(e) => setDitherScale(parseFloat(e.target.value))}
            className="w-full"
            aria-label="Dither strength"
          />
          <div className="mt-1 text-xs opacity-80">Scale: {ditherScale.toFixed(1)}</div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium">Depth (km)</h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: 'hsl(200 100% 50%)' }} />
            <span className="text-xs">Shallow</span>
            <div className="h-1 flex-1 bg-gradient-to-r from-[hsl(200_100%_50%)] via-[hsl(40_100%_50%)] to-[hsl(0_100%_50%)]" />
            <span className="text-xs">Deep</span>
            <span className="h-3 w-3 rounded-full" style={{ background: 'hsl(0 100% 50%)' }} />
          </div>
        </section>
      </div>
    </div>
  )
}

function PanelHeader() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold opacity-90">Controls</h2>
      <div className="relative">
        <button
          type="button"
          aria-label="How this site works"
          aria-expanded={open}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg/80 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-accent"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm-1-8a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
          </svg>
        </button>
        {open && (
          <div
            role="tooltip"
            className="absolute right-0 z-50 mt-2 w-80 max-w-sm rounded-md border border-muted bg-bg/95 p-4 text-sm leading-6 shadow-lg backdrop-blur"
          >
            <ul className="list-disc space-y-2 pl-5">
              <li><span className="font-semibold">Rotate</span>: drag</li>
              <li><span className="font-semibold">Zoom</span>: scroll/pinch</li>
              <li><span className="font-semibold">Pan</span>: right-drag / two-finger drag</li>
              <li>
                <span className="font-semibold">Earthquakes</span>: dots sized by magnitude, colored by depth. Hover to preview; click to pin; click empty space to close.
              </li>
              <li>
                <span className="font-semibold">Search</span>: type a place and pick a result to fly there. <span className="font-semibold">Filters</span>: adjust magnitude and dither.
              </li>
              <li>
                <span className="font-semibold">Theme</span>: toggle in the header. Data refreshes every 5 minutes.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}


