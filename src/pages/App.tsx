import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Globe } from '../components/Globe'
import { Legend } from '../components/Legend'
import { useUIStore } from '../stores/useUIStore'
import { AudioPlayer } from '../components/AudioPlayer'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  const { theme, setTheme, muted } = useUIStore()

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (saved) setTheme(saved)
  }, [setTheme])

  // Persist mute preference
  useEffect(() => {
    const saved = localStorage.getItem('muted')
    if (saved != null) useUIStore.setState({ muted: saved === 'true' })
  }, [])
  useEffect(() => {
    localStorage.setItem('muted', String(muted))
  }, [muted])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between p-3 md:p-4">
          <h1 className="font-semibold">Earfquake</h1>
          <div className="flex items-center gap-2">
            <button
              aria-label="Toggle theme"
              className="rounded-md border border-muted/50 bg-muted px-3 py-1 text-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>
        <main className="grid flex-1 grid-rows-[1fr_auto] md:grid-cols-[1fr_auto] md:grid-rows-1">
          <section className="order-1 md:order-1">
            <Globe />
          </section>
          <aside className="order-2 p-3 md:order-2 md:p-4">
            <Legend />
          </aside>
        </main>
        <AudioPlayer videoId="upOuxmILcjk" muted={muted} />
        <footer className="p-3 text-xs opacity-70 md:p-4">
          Data: USGS FDSN Event API
        </footer>
      </div>
    </QueryClientProvider>
  )
}


