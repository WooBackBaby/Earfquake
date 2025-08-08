import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

interface AudioPlayerProps {
  videoId: string
  muted: boolean
}

export function AudioPlayer({ videoId, muted }: AudioPlayerProps) {
  const playerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false

    function createPlayer() {
      if (cancelled) return
      if (playerRef.current) return
      playerRef.current = new window.YT.Player('yt-audio', {
        height: '0',
        width: '0',
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          loop: 1,
          playlist: videoId,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (e: any) => {
            try {
              e.target.setVolume(100)
              if (muted) {
                e.target.mute()
                e.target.playVideo()
              } else {
                // Many browsers require muted autoplay; try muted first, then unmute on first user gesture via store button
                e.target.mute()
                e.target.playVideo()
                setTimeout(() => {
                  try {
                    e.target.unMute()
                  } catch {}
                }, 200)
              }
            } catch {
              // ignore
            }
          },
          onStateChange: (e: any) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              try {
                e.target.playVideo()
              } catch {
                // ignore
              }
            }
          },
        },
      })
    }

    if (window.YT && window.YT.Player) {
      createPlayer()
    } else {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.body.appendChild(script)
      window.onYouTubeIframeAPIReady = () => createPlayer()
    }

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        // ignore
      }
      playerRef.current = null
    }
  }, [videoId])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    try {
      if (muted) player.mute()
      else player.unMute()
    } catch {
      // ignore
    }
  }, [muted])

  return (
    <div
      id="yt-audio"
      aria-hidden
      style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
    />
  )
}


