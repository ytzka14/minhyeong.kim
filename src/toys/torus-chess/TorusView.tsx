import { useEffect, useRef, type PointerEvent } from 'react'
import { COLS, ROWS, sq, type GameState } from './game/rules.ts'
import { GLYPH } from './game/view.ts'

interface Props {
  state: GameState
  lastMove: { from: number; to: number } | null
  checkSquare: number | null
}

// Rows wrap around the ring (major circle), columns around the tube (minor
// circle). Radii are chosen so a square's side is about 1 unit on the tube's
// outer equator: 2πR ≈ ROWS and 2πr ≈ COLS.
const MINOR = COLS / (2 * Math.PI)
const MAJOR = ROWS / (2 * Math.PI) + MINOR * 0.15
/** Sub-quads per square edge, so the curved squares look smooth. */
const SUB = 3
const CAMERA_DIST = 14
const LIGHT = normalize([-0.4, 0.6, 0.7])
const SPIN_SPEED = 0.12 // radians per second

type Vec3 = [number, number, number]

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const LIGHT_SQ = hexToRgb('#e9dcc0')
const DARK_SQ = hexToRgb('#9c7a54')
const LAST_TINT: Vec3 = [224, 190, 60]
const CHECK_TINT: Vec3 = [230, 40, 30]

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/**
 * Surface point and outward normal at board coordinates (row, col), which may
 * be fractional. Row 0 starts at the top of the ring as seen at rest.
 */
function surface(row: number, col: number): { p: Vec3; n: Vec3 } {
  const u = (row / ROWS) * 2 * Math.PI
  // Offset so the board's middle file faces outward rather than a seam.
  const v = ((col - COLS / 2 + 0.5) / COLS) * 2 * Math.PI
  const cu = Math.cos(u)
  const su = Math.sin(u)
  const cv = Math.cos(v)
  const sv = Math.sin(v)
  const ring = MAJOR + MINOR * cv
  return {
    p: [ring * cu, ring * su, MINOR * sv],
    n: [cv * cu, cv * su, sv],
  }
}

/** Precomputed model-space geometry; only the camera changes per frame. */
const QUADS = (() => {
  const quads: { square: number; corners: Vec3[]; normal: Vec3 }[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (let i = 0; i < SUB; i++) {
        for (let j = 0; j < SUB; j++) {
          const r0 = r + i / SUB
          const r1 = r + (i + 1) / SUB
          const c0 = c + j / SUB
          const c1 = c + (j + 1) / SUB
          quads.push({
            square: sq(r, c),
            corners: [surface(r0, c0).p, surface(r0, c1).p, surface(r1, c1).p, surface(r1, c0).p],
            normal: surface((r0 + r1) / 2, (c0 + c1) / 2).n,
          })
        }
      }
    }
  }
  return quads
})()

const CENTERS = (() => {
  const out: { p: Vec3; n: Vec3 }[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out[sq(r, c)] = surface(r + 0.5, c + 0.5)
  return out
})()

/** Rotate about the torus axis (spin), then tilt toward the viewer (pitch). */
function makeRotation(spin: number, pitch: number) {
  const cs = Math.cos(spin)
  const ss = Math.sin(spin)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  return ([x, y, z]: Vec3): Vec3 => {
    const x1 = x * cs - y * ss
    const y1 = x * ss + y * cs
    return [x1, y1 * cp - z * sp, y1 * sp + z * cp]
  }
}

export default function TorusView({ state, lastMove, checkSquare }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Kept in refs so the animation loop always draws the latest position
  // without restarting.
  const props = useRef({ state, lastMove, checkSquare })
  useEffect(() => {
    props.current = { state, lastMove, checkSquare }
  }, [state, lastMove, checkSquare])
  const camera = useRef({ spin: Math.PI / 2, pitch: -1.05 })
  const drag = useRef<{ x: number; y: number; spin: number; pitch: number; id: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let frame = 0
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!drag.current && !reduceMotion) camera.current.spin += SPIN_SPEED * dt

      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const { state, lastMove, checkSquare } = props.current
      const rotate = makeRotation(camera.current.spin, camera.current.pitch)
      const scale = (Math.min(w, h * 1.5) / (2 * (MAJOR + MINOR))) * 0.92 * (CAMERA_DIST - MINOR) / CAMERA_DIST
      const project = ([x, y, z]: Vec3): [number, number, number] => {
        const k = (scale * CAMERA_DIST) / (CAMERA_DIST - z)
        return [w / 2 + x * k, h / 2 - y * k, k]
      }
      /** Cosine between the surface normal and the direction to the camera. */
      const facing = (p: Vec3, n: Vec3) => {
        const v: Vec3 = [-p[0], -p[1], CAMERA_DIST - p[2]]
        return (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / Math.hypot(v[0], v[1], v[2])
      }

      type Item =
        | { z: number; kind: 'quad'; pts: [number, number][]; fill: string }
        | {
            z: number
            kind: 'piece'
            x: number
            y: number
            size: number
            glyph: string
            white: boolean
            alpha: number
          }
      const items: Item[] = []

      for (const q of QUADS) {
        const n = rotate(q.normal)
        const cs = q.corners.map(rotate)
        const mid: Vec3 = [
          (cs[0][0] + cs[2][0]) / 2,
          (cs[0][1] + cs[2][1]) / 2,
          (cs[0][2] + cs[2][2]) / 2,
        ]
        if (facing(mid, n) <= 0) continue
        const r = Math.floor(q.square / COLS)
        const c = q.square % COLS
        let base = (r + c) % 2 === 0 ? LIGHT_SQ : DARK_SQ
        if (lastMove && (lastMove.from === q.square || lastMove.to === q.square)) base = mix(base, LAST_TINT, 0.45)
        if (checkSquare === q.square) base = mix(base, CHECK_TINT, 0.7)
        const light = 0.35 + 0.65 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
        const [cr, cg, cb] = base.map((ch) => Math.round(ch * light))
        items.push({
          z: mid[2],
          kind: 'quad',
          pts: cs.map((p) => {
            const [x, y] = project(p)
            return [x, y]
          }),
          fill: `rgb(${cr} ${cg} ${cb})`,
        })
      }

      for (let s = 0; s < state.board.length; s++) {
        const piece = state.board[s]
        if (!piece) continue
        const n = rotate(CENTERS[s].n)
        const base = rotate(CENTERS[s].p)
        // Pieces seen edge-on would float off the silhouette: fade them out.
        const f = facing(base, n)
        if (f < 0.2) continue
        // Lift the glyph a little off the surface so it sorts in front of its square.
        const p: Vec3 = [base[0] + n[0] * 0.12, base[1] + n[1] * 0.12, base[2] + n[2] * 0.12]
        const [x, y, k] = project(p)
        // Shrink glyphs seen at an angle so the curvature reads.
        const tilt = 0.5 + 0.5 * f
        items.push({
          z: p[2],
          kind: 'piece',
          x,
          y,
          size: k * 0.8 * tilt,
          glyph: GLYPH[piece.kind],
          white: piece.color === 'w',
          alpha: Math.min(1, (f - 0.2) / 0.25),
        })
      }

      items.sort((a, b) => a.z - b.z)
      ctx.lineJoin = 'round'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const it of items) {
        if (it.kind === 'quad') {
          ctx.beginPath()
          ctx.moveTo(it.pts[0][0], it.pts[0][1])
          for (let i = 1; i < 4; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1])
          ctx.closePath()
          ctx.fillStyle = it.fill
          ctx.fill()
          // A hairline in the same colour hides the anti-aliasing seams between quads.
          ctx.strokeStyle = it.fill
          ctx.lineWidth = 0.6
          ctx.stroke()
        } else {
          ctx.globalAlpha = it.alpha
          ctx.font = `${it.size}px 'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', 'Noto Sans Symbols 2', serif`
          ctx.lineWidth = Math.max(1, it.size * 0.08)
          ctx.strokeStyle = it.white ? '#2a2420' : 'rgb(255 255 255 / 0.35)'
          ctx.strokeText(it.glyph, it.x, it.y)
          ctx.fillStyle = it.white ? '#fffaf0' : '#1f1b18'
          ctx.fillText(it.glyph, it.x, it.y)
          ctx.globalAlpha = 1
        }
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Drag to orbit: horizontal spins the ring, vertical tilts it.
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, ...camera.current, id: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    camera.current.spin = d.spin + (e.clientX - d.x) * 0.01
    camera.current.pitch = Math.max(-Math.PI, Math.min(0, d.pitch + (e.clientY - d.y) * 0.01))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className="torus-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label="The current position drawn on a 3D torus"
    />
  )
}
