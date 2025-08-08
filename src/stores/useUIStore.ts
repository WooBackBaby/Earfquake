import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface UIState {
  theme: Theme
  minMagnitude: number
  ditherScale: number
  focusTarget: { lat: number; lng: number } | null
  muted: boolean
  setTheme: (theme: Theme) => void
  setMinMagnitude: (value: number) => void
  setDitherScale: (value: number) => void
  setFocusTarget: (lat: number, lng: number) => void
  clearFocusTarget: () => void
  setMuted: (muted: boolean) => void
  toggleMuted: () => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  minMagnitude: 2.5,
  ditherScale: 1, // kept for shader param but UI removed
  focusTarget: null,
  muted: true,
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
  setMinMagnitude: (value) => set({ minMagnitude: value }),
  setDitherScale: (value) => set({ ditherScale: value }),
  setFocusTarget: (lat, lng) => set({ focusTarget: { lat, lng } }),
  clearFocusTarget: () => set({ focusTarget: null }),
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
}))


