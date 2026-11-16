import { useRef, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import { COLS, ROWS, sq, type CheckRoute, type GameState } from './game/rules.ts'
import { boardCoords, GLYPH, type View } from './game/view.ts'

export type TargetKind = 'move' | 'capture'

interface Props {
  state: GameState
  view: View
  onViewChange: (v: View) => void
  /** Number of wrapped "ghost" rows to show above and below the board. */
  ghostRows: number
  /** Number of wrapped "ghost" columns to show left and right of the board. */
  ghostCols: number
  selected: number | null
  targets: Map<number, TargetKind>
  lastMove: { from: number; to: number } | null
  checkSquare: number | null
  /** Routes of the pieces giving check, drawn as red lines. */
  checkRoutes: CheckRoute[]
  onSquareClick: (s: number) => void
}

const isWrapSeam = (a: number, b: number, n: number) => Math.abs(a - b) === n - 1

/** A line segment from the cell centre, at `angle` degrees, `len` cells long. */
interface Segment {
  angle: number
  len: number
}

/**
 * Turn check routes into per-square line segments. A path square gets a line
 * all the way through it; the king and attacker squares get a half line from
 * their centre toward each other, so the route reads as one continuous line
 * even where it crosses the wrap. Knight checks have no line, only the ring
 * on the attacker.
 */
function routeSegments(routes: CheckRoute[], king: number | null, flipped: boolean) {
  const segs = new Map<number, Segment[]>()
  const attackers = new Set<number>()
  const pathSquares = new Set<number>()
  const add = (s: number, seg: Segment) => {
    const list = segs.get(s) ?? []
    list.push(seg)
    segs.set(s, list)
  }
  for (const route of routes) {
    attackers.add(route.attacker)
    const [dr, dc] = route.dir
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1) continue // knight jump
    const sign = flipped ? -1 : 1
    const angle = (Math.atan2(dr * sign, dc * sign) * 180) / Math.PI
    const half = dr !== 0 && dc !== 0 ? Math.SQRT1_2 : 0.5
    for (const s of route.path) {
      pathSquares.add(s)
      add(s, { angle, len: half })
      add(s, { angle: angle + 180, len: half })
    }
    add(route.attacker, { angle: angle + 180, len: half })
    if (king !== null) add(king, { angle, len: half })
  }
  return { segs, attackers, pathSquares }
}

export default function Chessboard(props: Props) {
  const { state, view, ghostRows, ghostCols, selected, targets, lastMove, checkSquare } = props
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; id: number } | null>(null)
  const suppressClick = useRef(false)
  const wheelAcc = useRef({ x: 0, y: 0 })

  const displayRows: number[] = []
  for (let i = -ghostRows; i < ROWS + ghostRows; i++) displayRows.push(i)
  const displayCols: number[] = []
  for (let j = -ghostCols; j < COLS + ghostCols; j++) displayCols.push(j)

  const { segs, attackers, pathSquares } = routeSegments(props.checkRoutes, checkSquare, view.flipped)

  const cellSize = () => {
    const el = boardRef.current?.querySelector('.cell') as HTMLElement | null
    return el ? el.getBoundingClientRect().width : 48
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const size = cellSize()
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < size * 0.4) return
    if (!d.moved) {
      d.moved = true
      boardRef.current?.setPointerCapture(e.pointerId)
    }
    const nr = d.view.offR - Math.round(dy / size)
    const nc = d.view.offC - Math.round(dx / size)
    if (nr !== view.offR || nc !== view.offC) props.onViewChange({ ...view, offR: nr, offC: nc })
  }
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current
    if (d && d.id === e.pointerId && d.moved) suppressClick.current = true
    drag.current = null
  }
  const onWheel = (e: WheelEvent) => {
    const acc = wheelAcc.current
    acc.x += e.shiftKey ? e.deltaY : e.deltaX
    acc.y += e.shiftKey ? 0 : e.deltaY
    const step = 60
    const dr = Math.trunc(acc.y / step)
    const dc = Math.trunc(acc.x / step)
    if (dr || dc) {
      acc.y -= dr * step
      acc.x -= dc * step
      props.onViewChange({ ...view, offR: view.offR + dr, offC: view.offC + dc })
    }
  }

  const click = (s: number) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    props.onSquareClick(s)
  }

  return (
    <div className="board-frame">
      <div
        ref={boardRef}
        className="board"
        style={{ '--rows': displayRows.length, '--cols': displayCols.length } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {displayRows.map((i) => (
          <div className="board-row" key={i}>
            <div className="rank-label">{ROWS - boardCoords(view, i, 0)[0]}</div>
            {displayCols.map((j) => {
              const [r, c] = boardCoords(view, i, j)
              const s = sq(r, c)
              const p = state.board[s]
              const ghost = i < 0 || i >= ROWS || j < 0 || j >= COLS
              const [ru] = boardCoords(view, i - 1, j)
              const [, cl] = boardCoords(view, i, j - 1)
              const target = targets.get(s)
              const cls = [
                'cell',
                (r + c) % 2 === 0 ? 'light' : 'dark',
                ghost && 'ghost',
                i > -ghostRows && isWrapSeam(r, ru, ROWS) && 'seam-top',
                j > -ghostCols && isWrapSeam(c, cl, COLS) && 'seam-left',
                selected === s && 'selected',
                lastMove && (lastMove.from === s || lastMove.to === s) && 'last',
                checkSquare === s && 'check',
                pathSquares.has(s) && 'check-path',
                target && `target-${target}`,
              ]
                .filter(Boolean)
                .join(' ')
              let arrow = ''
              if (p?.kind === 'P') {
                const up = (p.dir === -1) !== view.flipped
                arrow = up ? '▲' : '▼'
              }
              return (
                <button
                  key={j}
                  className={cls}
                  onClick={() => click(s)}
                  aria-label={`${'abcdefgh'[c]}${ROWS - r}${p ? ` ${p.color === 'w' ? 'white' : 'black'} ${p.kind}` : ''}`}
                >
                  {segs.get(s)?.map((seg, k) => (
                    <span
                      key={k}
                      className="route"
                      style={{ '--angle': `${seg.angle}deg`, '--len': seg.len } as CSSProperties}
                    />
                  ))}
                  {attackers.has(s) && <span className="attacker-ring" />}
                  {target === 'move' && <span className="dot" />}
                  {p && (
                    <span className={`piece ${p.color === 'w' ? 'white' : 'black'}`}>
                      {GLYPH[p.kind]}
                      {arrow && <span className="pawn-dir">{arrow}</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        <div className="board-row file-labels">
          <div className="rank-label" />
          {displayCols.map((j) => (
            <div className="file-label" key={j}>
              {'abcdefgh'[boardCoords(view, 0, j)[1]]}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
