Background and Motivation

- The earthquake dots are too large when zoomed in and overlap heavily in dense regions, reducing legibility.

Key Challenges and Analysis

- Marker radius is static in world units, so when the camera moves closer, dots appear disproportionately large.
- Need zoom-aware scaling that keeps dots visually reasonable at all zoom levels without breaking interaction.

High-level Task Breakdown

1) Implement zoom-aware scaling for the markers group so dots shrink when zooming in and grow slightly when zooming out. Success: marker size clearly reduces at near zoom and increases at far zoom; no interaction regressions.
2) Tune base size mapping (magnitude → radius) to be smaller and slightly sub-linear to reduce overlap. Success: fewer overlaps in dense areas vs before.
3) Add a zoom slider control in the bottom-right to adjust camera distance. Success: slider reflects current zoom and dragging updates zoom smoothly.

Project Status Board

- [x] 1) Zoom-aware scaling for markers group
- [x] 2) Reduce and re-map base size by magnitude
- [x] 3) Zoom slider in bottom-right

Current Status / Progress Tracking

- Implemented group-based scaling driven by camera distance (mapped 1.3 → ~0.6x, 6.0 → ~2.2x, clamped). Tuned base radius to be smaller and sub-linear in magnitude.

Executor's Feedback or Assistance Requests

- Please review the new sizing feel. If further decluttering is desired, I can add simple clustering or screen-space sprites in a follow-up task.

Lessons

- Read files before editing; create `.cursor/scratchpad.md` if missing.
- Prefer group-level transforms for per-frame scaling over per-object to minimize re-renders.
