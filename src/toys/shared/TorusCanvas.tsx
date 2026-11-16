import { useEffect, useRef, type PointerEvent } from 'react'

export type RGB = [number, number, number]

/** How one grid cell is drawn on the torus. */
export interface TorusCell {
  fill: RGB
  label?: string
  labelColor?: string
  labelStroke?: string
  labelFont?: string
  /** Label size relative to the cell. Default 0.8. */
  labelScale?: number
}

interface Props {
  rows: number
  cols: number
  /** Called for every cell each frame; keep it cheap. */
  cellAt: (r: number, c: number) => TorusCell
  ariaLabel: string
  className?: string
}

type Vec3 = [number, number, number]

const LIGHT = normalize([-0.4, 0.6, 0.7])
const SPIN_SPEED = 0.12 // radians per second

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

/**
 * The torus for a rows × cols grid. The longer side of the grid wraps around
 * the ring and the shorter around the tube, sized so a cell is about 1 unit
 * on the tube's outer equator.
 */
function makeGeometry(rows: number, cols: number) {
  const ringAlongRows = rows >= cols
  const ringN = ringAlongRows ? rows : cols
  const tubeN = ringAlongRows ? cols : rows
  const minor = tubeN / (2 * Math.PI)
  // Keep a visible hole even for square grids.
  const major = Math.max(ringN / (2 * Math.PI) + minor * 0.15, minor * 1.8)

  /** Surface point and outward normal at (possibly fractional) grid coordinates. */
  const surface = (r: number, c: number): { p: Vec3; n: Vec3 } => {
    // Map (r, c) to (ring, tube) coordinates. When the ring runs along the
    // columns, the tube coordinate is reversed so the grid is rotated, not
    // mirrored.
    const a = ringAlongRows ? r : c
    const b = ringAlongRows ? c : rows - r
    const u = (a / ringN) * 2 * Math.PI
    // Offset so the middle of the grid faces outward rather than a seam.
    const v = ((b - tubeN / 2 + 0.5) / tubeN) * 2 * Math.PI
    const cu = Math.cos(u)
    const su = Math.sin(u)
    const cv = Math.cos(v)
    const sv = Math.sin(v)
    const ring = major + minor * cv
    return { p: [ring * cu, ring * su, minor * sv], n: [cv * cu, cv * su, sv] }
  }

  // Sub-quads per cell edge, so curved cells look smooth. Fewer on big grids.
  const sub = rows * cols > 200 ? 2 : 3
  const quads: { r: number; c: number; corners: Vec3[]; normal: Vec3 }[] = []
  const centers: { r: number; c: number; p: Vec3; n: Vec3 }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      centers.push({ r, c, ...surface(r + 0.5, c + 0.5) })
      for (let i = 0; i < sub; i++) {
        for (let j = 0; j < sub; j++) {
          const r0 = r + i / sub
          const r1 = r + (i + 1) / sub
          const c0 = c + j / sub
          const c1 = c + (j + 1) / sub
          quads.push({
            r,
            c,
            corners: [surface(r0, c0).p, surface(r0, c1).p, surface(r1, c1).p, surface(r1, c0).p],
            normal: surface((r0 + r1) / 2, (c0 + c1) / 2).n,
          })
        }
      }
    }
  }
  return { quads, centers, extent: major + minor, minor }
}

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

/**
 * A grid drawn on a slowly spinning 3D torus, with plain 2D canvas and
 * painter's-algorithm depth sorting. Drag to orbit.
 */
export default function TorusCanvas({ rows, cols, cellAt, ariaLabel, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Kept in a ref so the animation loop always draws the latest cells
  // without restarting.
  const cellAtRef = useRef(cellAt)
  useEffect(() => {
    cellAtRef.current = cellAt
  }, [cellAt])
  const camera = useRef({ spin: Math.PI / 2, pitch: -1.05 })
  const drag = useRef<{ x: number; y: number; spin: number; pitch: number; id: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const { quads, centers, extent, minor } = makeGeometry(rows, cols)
    const camDist = extent * 3.9

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

      const cells: TorusCell[] = new Array(rows * cols)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells[r * cols + c] = cellAtRef.current(r, c)

      const rotate = makeRotation(camera.current.spin, camera.current.pitch)
      const scale = (Math.min(w, h * 1.5) / (2 * extent)) * 0.92 * (camDist - minor) / camDist
      const project = ([x, y, z]: Vec3): [number, number, number] => {
        const k = (scale * camDist) / (camDist - z)
        return [w / 2 + x * k, h / 2 - y * k, k]
      }
      /** Cosine between the surface normal and the direction to the camera. */
      const facing = (p: Vec3, n: Vec3) => {
        const v: Vec3 = [-p[0], -p[1], camDist - p[2]]
        return (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / Math.hypot(v[0], v[1], v[2])
      }

      type Item =
        | { z: number; kind: 'quad'; pts: [number, number][]; fill: string }
        | { z: number; kind: 'label'; x: number; y: number; size: number; cell: TorusCell; alpha: number }
      const items: Item[] = []

      for (const q of quads) {
        const n = rotate(q.normal)
        const cs = q.corners.map(rotate)
        const mid: Vec3 = [
          (cs[0][0] + cs[2][0]) / 2,
          (cs[0][1] + cs[2][1]) / 2,
          (cs[0][2] + cs[2][2]) / 2,
        ]
        if (facing(mid, n) <= 0) continue
        const base = cells[q.r * cols + q.c].fill
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

      for (const ctr of centers) {
        const cell = cells[ctr.r * cols + ctr.c]
        if (!cell.label) continue
        const n = rotate(ctr.n)
        const base = rotate(ctr.p)
        // Labels seen edge-on would float off the silhouette: fade them out.
        const f = facing(base, n)
        if (f < 0.2) continue
        // Lift the label a little off the surface so it sorts in front of its cell.
        const p: Vec3 = [base[0] + n[0] * 0.12, base[1] + n[1] * 0.12, base[2] + n[2] * 0.12]
        const [x, y, k] = project(p)
        // Shrink labels seen at an angle so the curvature reads.
        const tilt = 0.5 + 0.5 * f
        items.push({
          z: p[2],
          kind: 'label',
          x,
          y,
          size: k * (cell.labelScale ?? 0.8) * tilt,
          cell,
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
          const { cell } = it
          ctx.globalAlpha = it.alpha
          ctx.font = `${it.size}px ${cell.labelFont ?? 'system-ui, sans-serif'}`
          if (cell.labelStroke) {
            ctx.lineWidth = Math.max(1, it.size * 0.08)
            ctx.strokeStyle = cell.labelStroke
            ctx.strokeText(cell.label!, it.x, it.y)
          }
          ctx.fillStyle = cell.labelColor ?? '#fff'
          ctx.fillText(cell.label!, it.x, it.y)
          ctx.globalAlpha = 1
        }
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [rows, cols])

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
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label={ariaLabel}
    />
  )
}
