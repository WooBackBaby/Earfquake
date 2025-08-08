import { Canvas, type ThreeElements, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import { EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEarthquakes } from '../hooks/useEarthquakes'
import { useUIStore } from '../stores/useUIStore'
import { Tooltip } from './Tooltip'

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

function depthToColor(depthKm: number, theme: 'light' | 'dark') {
  // Theme-aware, high-contrast, colorblind-friendly ramps
  // Dark: bright cyan → lime → yellow → orange
  // Light: strong blue → green → orange → red
  const t = Math.min(1, Math.max(0, depthKm / 300))
  const darkStops = [
    new THREE.Color('#0d8094'),
    new THREE.Color('#00ff9d'),
    new THREE.Color('#ffe600'),
    new THREE.Color('#ff5c39'),
  ]
  const lightStops = [
    new THREE.Color('#1d4ed8'), // blue-700
    new THREE.Color('#16a34a'), // green-600
    new THREE.Color('#f59e0b'), // amber-500
    new THREE.Color('#dc2626'), // red-600
  ]
  const stops = theme === 'dark' ? darkStops : lightStops
  const p = t * (stops.length - 1)
  const i = Math.floor(p)
  const f = p - i
  if (i >= stops.length - 1) return stops[stops.length - 1].clone()
  return stops[i].clone().lerp(stops[i + 1], f)
}

type TooltipData = { mag: number; place: string; time: number; depth: number; lat: number; lng: number }

function Markers({
  setTooltip,
  pinned,
  setPinned,
  minDist,
  maxDist,
}: {
  setTooltip: React.Dispatch<
    React.SetStateAction<{ visible: boolean; x: number; y: number; content: TooltipData | null }>
  >
  pinned: boolean
  setPinned: React.Dispatch<React.SetStateAction<boolean>>
  minDist: number
  maxDist: number
}) {
  const { data } = useEarthquakes()
  const minMag = useUIStore((s) => s.minMagnitude)
  const theme = useUIStore((s) => s.theme)
  const setFocusTarget = useUIStore((s) => s.setFocusTarget)
  const groupRef = useRef<THREE.Group>(null)
  const { camera, gl } = useThree()
  
  // Dynamically scale each marker mesh based on camera distance.
  // Scaling the group would move markers off the surface; per-mesh scaling preserves positions.
  useFrame(() => {
    const grp = groupRef.current
    if (!grp) return
    const distanceToOrigin = camera.position.length()
    const scale = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(distanceToOrigin, minDist, maxDist, 0.75, 2.0),
      0.9,
      2.2,
    )
    for (const obj of grp.children) {
      obj.scale.setScalar(scale)
      // Hide halos when markers exceed ~12px on screen to avoid banding
      const halosVisible = distanceToOrigin > (minDist + 0.45)
      for (const child of obj.children) {
        child.visible = halosVisible
      }
    }
  })

  const points = useMemo(() => {
    if (!data) return [] as Array<{ position: THREE.Vector3; color: THREE.Color; mag: number; place: string; time: number; depth: number; lat: number; lng: number }>
    return data.features
      .filter((f) => (f.properties.mag ?? 0) >= minMag)
      .map((f) => {
        const [lng, lat, depth] = f.geometry.coordinates
        const mag = f.properties.mag ?? 0
          return {
            position: latLngToVector3(lat, lng, 1.02),
            color: depthToColor(depth, theme),
            mag,
            place: f.properties.place,
            time: f.properties.time,
            depth,
            lat,
            lng,
          }
      })
  }, [data, minMag, theme])

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const mouse = useMemo(() => new THREE.Vector2(), [])

  function hitTest(e: any) {
    if (!groupRef.current) return null as null | TooltipData
    const rect = gl.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObjects(groupRef.current.children, true)
    if (intersects.length === 0) return null
    const obj = intersects[0].object as THREE.Mesh & { userData?: any }
    const d = obj.userData as TooltipData | undefined
    return d ?? null
  }

  function onPointerMove(e: any) {
    if (pinned) return
    const d = (e.object?.userData ?? null) as TooltipData | null
    if (d) setTooltip({ visible: true, x: e.clientX, y: e.clientY, content: { mag: d.mag, place: d.place, time: d.time, depth: d.depth, lat: d.lat, lng: d.lng } })
  }

  function onPointerDown(e: any) {
    const d = (e.object?.userData ?? hitTest(e)) as TooltipData | null
    if (d) {
      setPinned(true)
      setTooltip({ visible: true, x: e.clientX, y: e.clientY, content: { mag: d.mag, place: d.place, time: d.time, depth: d.depth, lat: d.lat, lng: d.lng } })
      // Center the view on the selected earthquake
      setFocusTarget(d.lat, d.lng)
    } else {
      setPinned(false)
      setTooltip((t) => ({ ...t, visible: false }))
    }
  }

  useEffect(() => {
    function handleCanvasPointerDown(ev: PointerEvent) {
      const d = hitTest(ev as any)
      if (!d) {
        setPinned(false)
        setTooltip((t) => ({ ...t, visible: false }))
      }
    }
    gl.domElement.addEventListener('pointerdown', handleCanvasPointerDown)
    return () => gl.domElement.removeEventListener('pointerdown', handleCanvasPointerDown)
  }, [gl, camera])

  return (
    <>
      <group ref={groupRef}>
        {points.map((p, idx) => (
          <mesh
            key={idx}
            position={p.position}
            userData={{ mag: p.mag, place: p.place, time: p.time, depth: p.depth, lat: p.lat, lng: p.lng }}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => {
              document.body.style.cursor = 'default'
              if (!pinned) setTooltip((t) => ({ ...t, visible: false }))
            }}
            frustumCulled={false}
          >
            {(() => {
              const baseRadius = 0.0008 + Math.pow(Math.max(0, p.mag), 0.9) * 0.0012
              return (
                <>
                  <sphereGeometry args={[baseRadius, 12, 12]} />
                  <meshBasicMaterial color={p.color} dithering={false} />
                  {/* dual halos to ensure WCAG non-text contrast against any background (auto-hidden when zoomed in) */}
                  {/* dark stroke */}
                   <mesh name="halo" scale={1.45} raycast={() => null}>
                    <sphereGeometry args={[baseRadius, 10, 10]} />
                    <meshBasicMaterial color={new THREE.Color('#000000')}
                                       transparent
                                        opacity={0.34}
                                       depthWrite={false}
                                       depthTest
                                       blending={THREE.NormalBlending} />
                  </mesh>
                  {/* light glow */}
                   <mesh name="halo2" scale={1.25} raycast={() => null}>
                    <sphereGeometry args={[baseRadius, 10, 10]} />
                    <meshBasicMaterial color={new THREE.Color('#ffffff')}
                                       transparent
                                        opacity={0.28}
                                       depthWrite={false}
                                       depthTest
                                       blending={THREE.AdditiveBlending} />
                  </mesh>
                </>
              )
            })()}
          </mesh>
        ))}
      </group>
      {/* Tooltip rendered by parent overlay */}
    </>
  )
}

function Earth({ theme, ditherScale, ...props }: ThreeElements['mesh'] & { theme: 'light' | 'dark'; ditherScale: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const [albedo, spec] = useTexture(['/textures/earth.jpg', '/textures/earth_spec.jpg'])

  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const fragmentShader = /* glsl */ `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uAlbedo;
    uniform sampler2D uSpec;
    uniform vec3 uLandColor;
    uniform vec3 uOceanColor;
    uniform float uThreshold;
    uniform float uFeather;
    uniform float uDitherScale; // visual scale
    uniform float uDarkMode;    // 1.0 for dark theme, 0.0 for light
    void main() {
      vec3 tex = texture2D(uAlbedo, vUv).rgb;
      // Ocean is bright in specular map; invert to get land mask
      float oceanSpec = texture2D(uSpec, vUv).r;
      float landMask = 1.0 - oceanSpec;
      // Combine with albedo luma for more robust coverage
      float luma = dot(tex, vec3(0.299, 0.587, 0.114));
      float base = max(landMask, step(uThreshold, luma));
      float mask = smoothstep(0.5 - uFeather, 0.5 + uFeather, base);
      vec3 col = mix(uOceanColor, uLandColor, mask);
      // Screen-space dot pattern applied only to the Earth (not markers)
      vec2 p = gl_FragCoord.xy / (5.5 / max(0.1, uDitherScale));
      vec2 f = fract(p) - 0.5;
      float dotMask = step(length(f), 0.30);
      float strength = 0.08 * clamp(uDitherScale, 0.6, 3.0);
      vec3 screenMix = 1.0 - (1.0 - col) * (1.0 - strength * dotMask);
      vec3 multiplyMix = col * (1.0 - strength * dotMask);
      col = mix(multiplyMix, screenMix, uDarkMode);
      gl_FragColor = vec4(col, 1.0);
    }
  `

  const uniforms = useMemo(() => {
    const land = new THREE.Color(theme === 'dark' ? '#A7B3C6' : '#1f2937') // slate-800
    const ocean = new THREE.Color(theme === 'dark' ? '#0B1220' : '#cbd5e1') // slate-300
    return {
      uAlbedo: { value: albedo },
      uSpec: { value: spec },
      uLandColor: { value: land },
      uOceanColor: { value: ocean },
      uThreshold: { value: 0.35 },
      uFeather: { value: 0.2 },
      uDitherScale: { value: ditherScale },
      uDarkMode: { value: theme === 'dark' ? 1.0 : 0.0 },
    }
  }, [albedo, spec, theme, ditherScale])

  return (
    <mesh ref={ref} {...(props as any)}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial args={[{ uniforms, vertexShader, fragmentShader }]} />
    </mesh>
  )
}

export function Globe() {
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: TooltipData | null }>(() => ({
    visible: false,
    x: 0,
    y: 0,
    content: null,
  }))
  const [pinned, setPinned] = useState(false)
  const theme = useUIStore((s) => s.theme)
  const ditherScale = useUIStore((s) => s.ditherScale)
  const focusTarget = useUIStore((s) => s.focusTarget)
  const clearFocusTarget = useUIStore((s) => s.clearFocusTarget)
  const controlsRef = useRef<any>(null)
  const [azimuthDeg, setAzimuthDeg] = useState(0)
  // Restore zoom UI slider
  const [zoom, setZoom] = useState(3.5)
  const minDist = 1.15
  const maxDist = 6
  // Slider normalization so RIGHT = zoom in, LEFT = zoom out
  const toSlider = (dist: number) => (maxDist - dist) / (maxDist - minDist)
  const fromSlider = (t: number) => maxDist - t * (maxDist - minDist)

  return (
    <div className="relative h-[60vh] w-screen md:h-full md:w-full">
      <Canvas camera={{ position: [0.8, 0.3, 3.5] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} intensity={0.5} />
        <Stars radius={100} depth={50} count={1500} factor={3} fade speed={1} />
        <Earth theme={theme} ditherScale={ditherScale} />
        <Markers setTooltip={setTooltip} pinned={pinned} setPinned={setPinned} minDist={minDist} maxDist={maxDist} />
        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={0.6}
          rotateSpeed={0.5}
          enableDamping
          dampingFactor={0.08}
            minDistance={minDist}
          maxDistance={maxDist}
           onChange={() => {
            const ctl = controlsRef.current
            if (!ctl) return
            const deg = THREE.MathUtils.radToDeg(ctl.getAzimuthalAngle() ?? 0)
            setAzimuthDeg(deg)
             const cam: THREE.PerspectiveCamera = ctl.object
             setZoom(cam.position.length())
          }}
        />
        <EffectComposer enableNormalPass={false}>
          {/* Noise removed per design request */}
          <Vignette eskil={false} offset={0.2} darkness={theme === 'dark' ? 0.5 : 0.35} />
        </EffectComposer>
      </Canvas>
      {/* Animate to focusTarget when set */}
      {focusTarget && (
        <AnimateTo lat={focusTarget.lat} lng={focusTarget.lng} onDone={clearFocusTarget} controlsRef={controlsRef} />
      )}
      <Compass
        azimuthDeg={azimuthDeg}
        onHome={() => {
          const ctl = controlsRef.current
          if (!ctl) return
          const cam: THREE.PerspectiveCamera = ctl.object
          const startPos = cam.position.clone()
           const endPos = new THREE.Vector3(0.8, 0.3, 3.5)
          const startTarget = ctl.target.clone()
          const endTarget = new THREE.Vector3(0, 0, 0)
          const durationMs = 900
          const start = performance.now()
          const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
          function step(now: number) {
            const t = Math.min(1, (now - start) / durationMs)
            const e = easeInOutCubic(t)
            cam.position.set(
              startPos.x + (endPos.x - startPos.x) * e,
              startPos.y + (endPos.y - startPos.y) * e,
              startPos.z + (endPos.z - startPos.z) * e,
            )
            ctl.target.set(
              startTarget.x + (endTarget.x - startTarget.x) * e,
              startTarget.y + (endTarget.y - startTarget.y) * e,
              startTarget.z + (endTarget.z - startTarget.z) * e,
            )
            ctl.update()
            if (t < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }}
      >
        <MuteButton />
      </Compass>
      {/* Zoom control (fixed bottom-right, with +/- buttons) */}
      <div className="pointer-events-auto fixed right-4 bottom-4 z-50">
        <div className="flex items-center gap-2 rounded-md border border-muted/60 bg-bg/80 px-3 py-2 shadow backdrop-blur">
          <label className="mr-1 hidden text-[11px] opacity-80 md:block">Zoom</label>
          <button
            type="button"
            aria-label="Zoom out"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-fg hover:bg-muted/70"
            onClick={() => {
              const ctl = controlsRef.current
              if (!ctl) return
              const cam: THREE.PerspectiveCamera = ctl.object
              const target = ctl.target as THREE.Vector3
              const dir = new THREE.Vector3().subVectors(cam.position, target).normalize()
              const dist = Math.min(maxDist, zoom + 0.2)
              cam.position.copy(dir.multiplyScalar(dist).add(target))
              cam.updateProjectionMatrix()
              ctl.update()
              setZoom(dist)
            }}
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={toSlider(zoom)}
            onChange={(e) => {
              const ctl = controlsRef.current
              if (!ctl) return
              const cam: THREE.PerspectiveCamera = ctl.object
              const target = ctl.target as THREE.Vector3
              const dir = new THREE.Vector3().subVectors(cam.position, target).normalize()
              const dist = fromSlider(parseFloat(e.target.value))
              cam.position.copy(dir.multiplyScalar(dist).add(target))
              cam.updateProjectionMatrix()
              ctl.update()
              setZoom(dist)
            }}
            aria-label="Zoom"
            className="h-2 w-40"
          />
          <button
            type="button"
            aria-label="Zoom in"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-fg hover:bg-muted/70"
            onClick={() => {
              const ctl = controlsRef.current
              if (!ctl) return
              const cam: THREE.PerspectiveCamera = ctl.object
              const target = ctl.target as THREE.Vector3
              const dir = new THREE.Vector3().subVectors(cam.position, target).normalize()
              const dist = Math.max(minDist, zoom - 0.2)
              cam.position.copy(dir.multiplyScalar(dist).add(target))
              cam.updateProjectionMatrix()
              ctl.update()
              setZoom(dist)
            }}
          >
            +
          </button>
        </div>
      </div>
      <Tooltip
        visible={tooltip.visible && !!tooltip.content}
        x={tooltip.x}
        y={tooltip.y}
        mag={tooltip.content?.mag ?? 0}
        place={tooltip.content?.place ?? ''}
        time={tooltip.content?.time ?? 0}
        depthKm={tooltip.content?.depth ?? 0}
      />
    </div>
  )
}

function MuteButton() {
  const muted = useUIStore((s) => s.muted)
  const toggleMuted = useUIStore((s) => s.toggleMuted)
  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute music' : 'Mute music'}
      className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md bg-bg/70 text-fg shadow backdrop-blur hover:bg-muted/60 focus:outline-none"
      onClick={toggleMuted}
    >
      {muted ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5 9v6h4l5 5V4L9 9H5zM19 9l-2 2 2 2 2-2-2-2z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5 9v6h4l5 5V4L9 9H5zM16.5 12c0-1.77 1.02-3.29 2.5-4.03v8.06c-1.48-.74-2.5-2.26-2.5-4.03z" />
        </svg>
      )}
    </button>
  )
}

function AnimateTo({ lat, lng, onDone, controlsRef }: { lat: number; lng: number; onDone: () => void; controlsRef: React.RefObject<any> }) {
  useEffect(() => {
    const ctl = controlsRef.current
    if (!ctl) return
    const cam: THREE.PerspectiveCamera = ctl.object
    const startPos = cam.position.clone()
    // Preserve current zoom (camera distance) while rotating to face the target
    const currentDistance = cam.position.length()
    const targetVec = latLngToVector3(lat, lng, currentDistance)
    const endPos = targetVec
    const startTarget = ctl.target.clone()
    const endTarget = new THREE.Vector3(0, 0, 0)
    const durationMs = 1000
    const start = performance.now()
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs)
      const e = ease(t)
      cam.position.set(
        startPos.x + (endPos.x - startPos.x) * e,
        startPos.y + (endPos.y - startPos.y) * e,
        startPos.z + (endPos.z - startPos.z) * e,
      )
      ctl.target.set(
        startTarget.x + (endTarget.x - startTarget.x) * e,
        startTarget.y + (endTarget.y - startTarget.y) * e,
        startTarget.z + (endTarget.z - startTarget.z) * e,
      )
      ctl.update()
      if (t < 1) requestAnimationFrame(step)
      else onDone()
    }
    requestAnimationFrame(step)
  }, [lat, lng, controlsRef, onDone])
  return null
}

function Compass({ azimuthDeg, onHome, children }: { azimuthDeg: number; onHome: () => void; children?: React.ReactNode }) {
  // North indicator rotates opposite to camera azimuth
  const rotation = -azimuthDeg
  return (
    <div className="pointer-events-none absolute left-3 bottom-3 flex items-center gap-4 md:left-4 md:bottom-4 md:gap-5">
      <div className="relative h-16 w-16 rounded-full border border-fg/30 bg-bg/80 shadow backdrop-blur">
        {/* crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-px -translate-x-1/2 -translate-y-1/2 bg-fg/40" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-12 -translate-x-1/2 -translate-y-1/2 bg-fg/40" />
        <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold opacity-90 md:text-[12px]">
          <div className="absolute top-0 translate-y-[-2px]">N</div>
          <div className="absolute right-0 translate-x-[2px]">E</div>
          <div className="absolute bottom-0 translate-y-[2px]">S</div>
          <div className="absolute left-0 translate-x-[-2px]">W</div>
        </div>
        <svg
          className="absolute left-1/2 top-1/2 -ml-2 -mt-2"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
          aria-hidden
        >
          <path d="M12 2 L15 10 L12 8 L9 10 Z" fill="currentColor" />
        </svg>
      </div>
      <button
        type="button"
        aria-label="Reset view to home"
        className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md bg-bg/70 text-fg shadow backdrop-blur hover:bg-muted/60 focus:outline-none focus:ring-0"
        onClick={onHome}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3l9 8h-3v10h-5v-6H11v6H6V11H3l9-8z" />
        </svg>
      </button>
      {children}
    </div>
  )
}


