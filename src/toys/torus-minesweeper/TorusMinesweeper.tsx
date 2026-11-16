import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent,
} from 'react'
import TorusCanvas, { type RGB, type TorusCell } from '../shared/TorusCanvas.tsx'
import { chord, mod, newGame, reveal, toggleFlag, type Game } from './game.ts'
import './torus-minesweeper.css'

const DIFFICULTIES = [
  { id: 'small', label: 'Small', rows: 9, cols: 9, mines: 10 },
  { id: 'medium', label: 'Medium', rows: 16, cols: 16, mines: 40 },
  { id: 'large', label: 'Large', rows: 16, cols: 30, mines: 99 },
] as const

const FLAG = '⚑'
const MINE = '✹'

interface Settings {
  difficulty: number
  margin: number
  /** Dragging the board rolls the torus. */
  dragToRoll: boolean
  showTorus: boolean
}

const DEFAULT_SETTINGS: Settings = { difficulty: 0, margin: 2, showTorus: true, dragToRoll: true }
const SETTINGS_KEY = 'torus-minesweeper:settings'
const BEST_KEY = 'torus-minesweeper:best'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return fallback
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore: it just won't persist.
  }
}

// Colours for the 3D view; the 2D board uses the matching CSS.
const COVERED: [RGB, RGB] = [[84, 104, 126], [76, 95, 116]]
const OPEN: [RGB, RGB] = [[40, 48, 58], [35, 42, 51]]
const EXPLODED: RGB = [200, 52, 40]
const NUMBER_COLOR = ['', '#6cb4ff', '#7bd88f', '#ff7a6b', '#c39bff', '#ffb86b', '#5fe0d6', '#e8e8e8', '#a8b0b8']

/** Wall-clock time; only called from event handlers and effects. */
const clock = () => Date.now()

interface View {
  offR: number
  offC: number
}

export default function TorusMinesweeper() {
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS_KEY, DEFAULT_SETTINGS))
  const updateSettings = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  useEffect(() => save(SETTINGS_KEY, settings), [settings])

  const diff = DIFFICULTIES[settings.difficulty] ?? DIFFICULTIES[0]
  const [game, setGame] = useState<Game>(() => newGame(diff.rows, diff.cols, diff.mines))
  const [view, setView] = useState<View>({ offR: 0, offC: 0 })
  const [flagMode, setFlagMode] = useState(false)
  const [best, setBest] = useState<Record<string, number>>(() => load(BEST_KEY, {}))

  // ---- Timer ----
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endedAt, setEndedAt] = useState<number | null>(null)
  const [now, setNow] = useState(clock)
  const playing = game.status === 'playing'
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setNow(clock()), 250)
    return () => clearInterval(t)
  }, [playing])
  const elapsed = startedAt === null ? 0 : Math.floor(((endedAt ?? now) - startedAt) / 1000)

  const start = (d = diff) => {
    setGame(newGame(d.rows, d.cols, d.mines))
    setStartedAt(null)
    setEndedAt(null)
    setView({ offR: 0, offC: 0 })
  }

  /** Apply a move, starting or stopping the clock as the game changes state. */
  const apply = (next: Game) => {
    if (next === game) return
    const t = clock()
    if (game.status === 'ready' && next.status !== 'ready') {
      setStartedAt(t)
      setNow(t)
    }
    if (next.status === 'won' || next.status === 'lost') {
      setEndedAt(t)
      if (next.status === 'won') {
        const secs = Math.floor((t - (startedAt ?? t)) / 1000)
        if (best[diff.id] === undefined || secs < best[diff.id]) {
          const b = { ...best, [diff.id]: secs }
          setBest(b)
          save(BEST_KEY, b)
        }
      }
    }
    setGame(next)
  }

  const onCellClick = (i: number) => {
    const cell = game.cells[i]
    if (cell.state === 'revealed') apply(chord(game, i))
    else if (flagMode) apply(toggleFlag(game, i))
    else if (cell.state === 'covered') apply(reveal(game, i))
  }

  const onCellContextMenu = (e: MouseEvent, i: number) => {
    e.preventDefault()
    apply(toggleFlag(game, i))
  }

  // ---- Rolling the torus: drag, wheel, arrow keys ----
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; id: number } | null>(null)
  const suppressClick = useRef(false)
  const wheelAcc = useRef({ x: 0, y: 0 })

  const cellSize = () => {
    const el = boardRef.current?.querySelector('.cell') as HTMLElement | null
    return el ? el.getBoundingClientRect().width : 28
  }
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !settings.dragToRoll) return
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const size = cellSize()
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < size * 0.5) return
    if (!d.moved) {
      d.moved = true
      boardRef.current?.setPointerCapture(e.pointerId)
    }
    setView({ offR: d.view.offR - Math.round(dy / size), offC: d.view.offC - Math.round(dx / size) })
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
      setView((v) => ({ offR: v.offR + dr, offC: v.offC + dc }))
    }
  }
  const guardClick = (fn: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    fn()
  }
  const pan = (dr: number, dc: number) => setView((v) => ({ offR: v.offR + dr, offC: v.offC + dc }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      }
      if (dirs[e.key]) {
        e.preventDefault()
        const [dr, dc] = dirs[e.key]
        setView((v) => ({ offR: v.offR + dr, offC: v.offC + dc }))
      } else if (e.key === 'f' || e.key === 'F') {
        setFlagMode((m) => !m)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- Display ----
  const { rows, cols } = game
  const margin = settings.margin
  const displayRows: number[] = []
  for (let i = -margin; i < rows + margin; i++) displayRows.push(i)
  const displayCols: number[] = []
  for (let j = -margin; j < cols + margin; j++) displayCols.push(j)

  const lost = game.status === 'lost'
  const won = game.status === 'won'

  const cellAt = useCallback(
    (r: number, c: number): TorusCell => {
      const i = r * cols + c
      const cell = game.cells[i]
      const parity = (r + c) % 2
      if (cell.state === 'flagged') {
        const wrong = lost && !cell.mine
        return { fill: COVERED[parity], label: wrong ? '✕' : FLAG, labelColor: wrong ? '#ffb3a8' : '#ff6b5b', labelScale: 0.7 }
      }
      if (cell.state === 'covered') return { fill: COVERED[parity] }
      if (cell.mine) {
        return { fill: game.exploded === i ? EXPLODED : OPEN[parity], label: MINE, labelColor: '#f2f4f6', labelScale: 0.75 }
      }
      return {
        fill: OPEN[parity],
        label: cell.adj ? String(cell.adj) : undefined,
        labelColor: NUMBER_COLOR[cell.adj],
        labelFont: 'ui-sans-serif, system-ui, sans-serif',
        labelScale: 0.7,
      }
    },
    [game, cols, lost],
  )

  let status: string
  if (won) status = `Cleared in ${elapsed}s`
  else if (lost) status = 'Boom. Try again?'
  else if (game.status === 'ready') status = 'Click any cell to start'
  else status = flagMode ? 'Flag mode: clicks place flags' : 'Clear every safe cell'

  return (
    <div className="torus-minesweeper">
      <div className="app">
        <header className="topbar">
          <div className="top-panel">
            <div className="brand">
              <h1>Torus Minesweeper</h1>
              <span className="tagline">no edges, no corners</span>
            </div>
            <div
              className="tool-group"
              title={`You can also ${settings.dragToRoll ? 'drag the board, ' : ''}scroll, or use the arrow keys`}
            >
              <button onClick={() => pan(0, -1)} aria-label="Roll left">←</button>
              <button onClick={() => pan(-1, 0)} aria-label="Roll up">↑</button>
              <button onClick={() => pan(1, 0)} aria-label="Roll down">↓</button>
              <button onClick={() => pan(0, 1)} aria-label="Roll right">→</button>
              <button onClick={() => setView({ offR: 0, offC: 0 })} aria-label="Reset view" title="Reset view">
                ⟲
              </button>
              <button
                className={settings.dragToRoll ? 'toggle-on' : undefined}
                aria-pressed={settings.dragToRoll}
                onClick={() => updateSettings({ dragToRoll: !settings.dragToRoll })}
                title="Drag the board to roll it"
              >
                {settings.dragToRoll ? 'Drag: on' : 'Drag: off'}
              </button>
            </div>
            <label className="tool-group margin-control">
              Wrap margin
              <input
                type="range"
                min={0}
                max={4}
                value={margin}
                onChange={(e) => updateSettings({ margin: Number(e.target.value) })}
              />
              <output>{margin}</output>
            </label>
          </div>
        </header>

        <div className="layout">
          <main className="board-area">
            <div className="board-frame">
              <div
                ref={boardRef}
                className={`board ${game.status}`}
                style={{ '--rows': displayRows.length, '--cols': displayCols.length } as CSSProperties}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
              >
                {displayRows.map((di) => (
                  <div className="board-row" key={di}>
                    {displayCols.map((dj) => {
                      const r = mod(di + view.offR, rows)
                      const c = mod(dj + view.offC, cols)
                      const i = r * cols + c
                      const cell = game.cells[i]
                      const ghost = di < 0 || di >= rows || dj < 0 || dj >= cols
                      const wrongFlag = lost && cell.state === 'flagged' && !cell.mine
                      const cls = [
                        'cell',
                        cell.state,
                        (r + c) % 2 ? 'odd' : 'even',
                        ghost && 'ghost',
                        r === 0 && di > -margin && 'seam-top',
                        c === 0 && dj > -margin && 'seam-left',
                        cell.state === 'revealed' && cell.mine && 'mine',
                        game.exploded === i && 'exploded',
                        wrongFlag && 'wrong',
                      ]
                        .filter(Boolean)
                        .join(' ')
                      let content = ''
                      if (cell.state === 'flagged') content = wrongFlag ? '✕' : FLAG
                      else if (cell.state === 'revealed') content = cell.mine ? MINE : cell.adj ? String(cell.adj) : ''
                      return (
                        <button
                          key={dj}
                          className={cls}
                          data-n={cell.state === 'revealed' && !cell.mine ? cell.adj : undefined}
                          onClick={guardClick(() => onCellClick(i))}
                          onContextMenu={(e) => onCellContextMenu(e, i)}
                          aria-label={`Row ${r + 1}, column ${c + 1}: ${
                            cell.state === 'revealed' ? (cell.mine ? 'mine' : `${cell.adj} adjacent mines`) : cell.state
                          }`}
                        >
                          {content}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </main>

          <aside className="panel">
            <div className={`status ${won ? 'won' : lost ? 'lost' : ''}`}>
              <span className="status-text">{status}</span>
              <span className="counters">
                <span title="Mines left">{MINE} {game.mines - game.flags}</span>
                <span title="Time">⏱ {elapsed}</span>
              </span>
            </div>

            <details
              className="torus-view"
              open={settings.showTorus}
              onToggle={(e) => updateSettings({ showTorus: e.currentTarget.open })}
            >
              <summary>Torus view</summary>
              {settings.showTorus && (
                <TorusCanvas
                  rows={rows}
                  cols={cols}
                  cellAt={cellAt}
                  className="torus-canvas"
                  ariaLabel="The minefield drawn on a 3D torus"
                />
              )}
            </details>

            <section className="controls">
              <label>
                Board
                <select
                  value={settings.difficulty}
                  onChange={(e) => {
                    const d = Number(e.target.value)
                    updateSettings({ difficulty: d })
                    start(DIFFICULTIES[d])
                  }}
                >
                  {DIFFICULTIES.map((d, i) => (
                    <option key={d.id} value={i}>
                      {d.label} · {d.cols}×{d.rows}, {d.mines} mines
                    </option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <button className={won || lost ? 'primary' : undefined} onClick={() => start()}>
                  New game
                </button>
                <button
                  className={flagMode ? 'active' : undefined}
                  aria-pressed={flagMode}
                  onClick={() => setFlagMode((m) => !m)}
                  title="Toggle with F. Right-click also places flags."
                >
                  {FLAG} Flag mode
                </button>
              </div>
              <div className="best">
                Best: {best[diff.id] !== undefined ? `${best[diff.id]}s` : '—'}
              </div>
            </section>

            <details className="rules">
              <summary>How it works</summary>
              <ul>
                <li>The grid wraps around both ways: off the top is the bottom, off the left is the right.</li>
                <li>So every cell has exactly eight neighbours, even along the seams.</li>
                <li>Click to reveal. Right-click (or use flag mode) to flag a mine.</li>
                <li>Click a number whose mines are all flagged to open the rest of its neighbours.</li>
                <li>Your first click is always safe. Drag, scroll, or use the arrow keys to roll the board.</li>
              </ul>
            </details>
          </aside>
        </div>
      </div>
    </div>
  )
}
