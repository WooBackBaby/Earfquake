import { Canvas, type ThreeElements, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import { EffectComposer, Noise, Vignette, DotScreen } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
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

function depthToColor(depthKm: number) {
  // 0km -> blue, 300km -> red via yellow
  const t = Math.min(1, Math.max(0, depthKm / 300))
  const color = new THREE.Color()
  // interpolate blue->yellow->red
  if (t < 0.5) {
    color.setHSL(0.55 - t * 0.55 * 2, 1, 0.5) // blue to yellow
  } else {
    const tt = (t - 0.5) * 2
    color.setHSL(0.1 * (1 - tt), 1, 0.5) // yellow to red
  }
  return color
}

type TooltipData = { mag: number; place: string; time: number; depth: number }

function Markers({
  setTooltip,
  pinned,
  setPinned,
}: {
  setTooltip: React.Dispatch<
    React.SetStateAction<{ visible: boolean; x: number; y: number; content: TooltipData | null }>
  >
  pinned: boolean
  setPinned: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const { data } = useEarthquakes()
  const minMag = useUIStore((s) => s.minMagnitude)
  const groupRef = useRef<THREE.Group>(null)
  const { camera, gl } = useThree()

  const points = useMemo(() => {
    if (!data) return [] as Array<{ position: THREE.Vector3; color: THREE.Color; mag: number; place: string; time: number; depth: number }>
    return data.features
      .filter((f) => (f.properties.mag ?? 0) >= minMag)
      .map((f) => {
        const [lng, lat, depth] = f.geometry.coordinates
        const mag = f.properties.mag ?? 0
        return {
          position: latLngToVector3(lat, lng, 1.02),
          color: depthToColor(depth),
          mag,
          place: f.properties.place,
          time: f.properties.time,
          depth,
        }
      })
  }, [data, minMag])

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
    if (d) setTooltip({ visible: true, x: e.clientX, y: e.clientY, content: { mag: d.mag, place: d.place, time: d.time, depth: d.depth } })
  }

  function onPointerDown(e: any) {
    const d = (e.object?.userData ?? hitTest(e)) as TooltipData | null
    if (d) {
      setPinned(true)
      setTooltip({ visible: true, x: e.clientX, y: e.clientY, content: { mag: d.mag, place: d.place, time: d.time, depth: d.depth } })
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
            userData={{ mag: p.mag, place: p.place, time: p.time, depth: p.depth }}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => {
              document.body.style.cursor = 'default'
              if (!pinned) setTooltip((t) => ({ ...t, visible: false }))
            }}
          >
            <sphereGeometry args={[0.001 + p.mag * 0.0015, 8, 8]} />
            <meshBasicMaterial color={p.color} dithering />
          </mesh>
        ))}
      </group>
      {/* Tooltip rendered by parent overlay */}
    </>
  )
}

function Earth({ theme, ...props }: ThreeElements['mesh'] & { theme: 'light' | 'dark' }) {
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
      gl_FragColor = vec4(col, 1.0);
    }
  `

  const uniforms = useMemo(() => {
    const land = new THREE.Color(theme === 'dark' ? '#A7B3C6' : '#334155')
    const ocean = new THREE.Color(theme === 'dark' ? '#0B1220' : '#E6EEF7')
    return {
      uAlbedo: { value: albedo },
      uSpec: { value: spec },
      uLandColor: { value: land },
      uOceanColor: { value: ocean },
      uThreshold: { value: 0.35 },
      uFeather: { value: 0.2 },
    }
  }, [albedo, spec, theme])

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

  return (
    <div className="relative h-[60vh] w-screen md:h-full md:w-full">
      <Canvas camera={{ position: [0.8, 0.3, 2.8] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} intensity={0.5} />
        <Stars radius={100} depth={50} count={1500} factor={3} fade speed={1} />
        <Earth theme={theme} />
        <Markers setTooltip={setTooltip} pinned={pinned} setPinned={setPinned} />
        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={0.6}
          rotateSpeed={0.5}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.3}
          maxDistance={6}
          onChange={() => {
            const ctl = controlsRef.current
            if (!ctl) return
            const deg = THREE.MathUtils.radToDeg(ctl.getAzimuthalAngle() ?? 0)
            setAzimuthDeg(deg)
          }}
        />
        <EffectComposer enableNormalPass={false}>
          <DotScreen
            blendFunction={theme === 'dark' ? BlendFunction.SCREEN : BlendFunction.MULTIPLY}
            angle={Math.PI / 4}
            scale={ditherScale}
          />
          <Noise premultiply opacity={(theme === 'dark' ? 0.1 : 0.08) * Math.min(1, ditherScale / 1.0)} />
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
          const endPos = new THREE.Vector3(0.8, 0.3, 2.8)
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
    // Face the target by rotating the camera around origin so the given lat/lng is centered
    const targetVec = latLngToVector3(lat, lng, 2.8)
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


