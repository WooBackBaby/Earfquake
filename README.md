## Earfquake – 3D Global Earthquake Visualizer

Interactive, responsive web app that visualizes global earthquake activity from the USGS FDSN Event API on a rotatable 3-D globe.

### Tech
- React 18 + Vite + TypeScript
- three.js + @react-three/fiber + @react-three/drei
- TanStack Query for fetching/caching
- Tailwind CSS v3 with CSS variables for light/dark themes
- zustand for UI state (theme, filters)
- date-fns for date math

### Setup
1. Requirements: Node 18 LTS recommended
2. Install deps:

```bash
npm install
```

3. Run dev:

```bash
npm run dev
```

4. Build:

```bash
npm run build && npm run preview
```

### Notes
- Data fetched from USGS last 30 days, refreshed every 5 minutes.
- Toggle dark/light in header. Preference persists.
- Use the magnitude slider in the legend to filter events.
