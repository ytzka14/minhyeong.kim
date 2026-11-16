import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chessboard, { type TargetKind } from './Chessboard.tsx'
import {
  applyMove, checkRoutes, COLS, findKing, inCheck, initialState, legalMovesFrom, moveNotation,
  outcome, ROWS, type Color, type GameState, type Move, type Piece,
} from './game/rules.ts'
import { GLYPH, type View } from './game/view.ts'
import './torus-chess.css'

interface Ply {
  state: GameState
  move?: Move
  notation?: string
  captured?: Piece
}

type Mode = 'pvp' | 'ai-black' | 'ai-white' | 'cvc'

const DIFFICULTY = [
  { label: 'Easy', depth: 1 },
  { label: 'Medium', depth: 2 },
  { label: 'Hard', depth: 3 },
  { label: 'Brutal (slow)', depth: 4 },
]

/** Minimum time between moves when watching computer vs computer. */
const SPEEDS = [
  { label: 'Fast', ms: 100 },
  { label: 'Normal', ms: 700 },
  { label: 'Slow', ms: 1600 },
]

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' }

/** The human's opponent color in a vs-computer game, else null. */
const aiColorFor = (mode: Mode): Color | null =>
  mode === 'ai-black' ? 'b' : mode === 'ai-white' ? 'w' : null

const isAiColor = (mode: Mode, color: Color) => mode === 'cvc' || aiColorFor(mode) === color

interface Settings {
  ghostRows: number
  ghostCols: number
  showRoutes: boolean
}

const DEFAULT_SETTINGS: Settings = { ghostRows: 1, ghostCols: 1, showRoutes: true }
const SETTINGS_KEY = 'torus-chess:settings'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return DEFAULT_SETTINGS
}

function makePly(prev: GameState, m: Move): Ply {
  const state = applyMove(prev, m)
  const captured = prev.board[m.to] ?? (m.enPassant !== undefined ? prev.board[m.enPassant] : null)
  return { state, move: m, notation: moveNotation(prev, m, state), captured: captured ?? undefined }
}

export default function TorusChess() {
  const [plies, setPlies] = useState<Ply[]>(() => [{ state: initialState() }])
  const [selected, setSelected] = useState<number | null>(null)
  const [promotionChoices, setPromotionChoices] = useState<Move[] | null>(null)
  const [mode, setMode] = useState<Mode>('ai-black')
  /** Difficulty index per side; in vs-computer games only the AI's side is used. */
  const [aiLevel, setAiLevel] = useState<Record<Color, number>>({ w: 2, b: 2 })
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  /** Computer-vs-computer games wait for an explicit "Start game". */
  const [started, setStarted] = useState(false)
  /** One move requested while paused. */
  const [stepping, setStepping] = useState(false)
  const [view, setView] = useState<View>({ offR: 0, offC: 0, flipped: false })
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const updateSettings = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Ignore: settings just won't persist.
    }
  }, [settings])
  const [thinking, setThinking] = useState(false)

  const current = plies[plies.length - 1].state
  const history = useMemo(() => plies.map((p) => p.state), [plies])
  const result = useMemo(() => outcome(current, history), [current, history])
  const aiColor = aiColorFor(mode)
  const watching = mode === 'cvc'
  const aiTurn =
    result.kind === 'ongoing' &&
    isAiColor(mode, current.turn) &&
    (!watching || !paused || stepping)
  const aiDepth = DIFFICULTY[aiLevel[current.turn]].depth
  const minDelay = watching ? SPEEDS[speed].ms : 350

  // ---- AI worker ----
  const workerRef = useRef<Worker | null>(null)
  const requestId = useRef(0)
  useEffect(() => {
    const w = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    const w = workerRef.current
    if (!w || !aiTurn) return
    const id = ++requestId.current
    let cancelled = false
    // Marks the start of an external (worker) search; intentional, kept as in the upstream repo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThinking(true)
    const started = performance.now()
    const onMessage = (e: MessageEvent<{ id: number; move: Move | null }>) => {
      if (e.data.id !== id) return
      // Give the viewer a moment to see the board before the move lands.
      const delay = Math.max(0, minDelay - (performance.now() - started))
      setTimeout(() => {
        if (cancelled || requestId.current !== id) return
        setThinking(false)
        setStepping(false)
        const m = e.data.move
        if (m) setPlies((ps) => [...ps, makePly(ps[ps.length - 1].state, m)])
      }, delay)
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, state: current, depth: aiDepth })
    return () => {
      w.removeEventListener('message', onMessage)
      cancelled = true
      setThinking(false)
    }
  }, [aiTurn, current, aiDepth, minDelay])

  // ---- Interaction ----
  const legalFromSelected = useMemo(
    () => (selected === null ? [] : legalMovesFrom(current, selected)),
    [current, selected],
  )
  const targets = useMemo(() => {
    const t = new Map<number, TargetKind>()
    for (const m of legalFromSelected) {
      t.set(m.to, current.board[m.to] || m.enPassant !== undefined ? 'capture' : 'move')
    }
    return t
  }, [legalFromSelected, current])

  const humanCanMove =
    result.kind === 'ongoing' && !watching && !aiTurn && !promotionChoices

  const play = useCallback((m: Move) => {
    setPlies((ps) => [...ps, makePly(ps[ps.length - 1].state, m)])
    setSelected(null)
    setPromotionChoices(null)
  }, [])

  const onSquareClick = (s: number) => {
    if (!humanCanMove) return
    const p = current.board[s]
    if (selected !== null) {
      const moves = legalFromSelected.filter((m) => m.to === s)
      if (moves.length > 1) {
        setPromotionChoices(moves)
        return
      }
      if (moves.length === 1) {
        play(moves[0])
        return
      }
    }
    if (p && p.color === current.turn && s !== selected) setSelected(s)
    else setSelected(null)
  }

  const newGame = (m: Mode = mode) => {
    requestId.current++
    setPlies([{ state: initialState() }])
    setSelected(null)
    setPromotionChoices(null)
    setPaused(m === 'cvc')
    setStarted(false)
    setStepping(false)
    setView({ offR: 0, offC: 0, flipped: m === 'ai-white' })
  }

  const undo = () => {
    requestId.current++
    setSelected(null)
    setPromotionChoices(null)
    // When watching, undo pauses so the computer doesn't immediately replay.
    if (watching) {
      setPaused(true)
      setStepping(false)
    }
    setPlies((ps) => {
      if (ps.length <= 1) return ps
      if (watching) return ps.slice(0, -1)
      let n = ps.length - 1
      // Against the AI, roll back to the human's turn.
      if (aiColor) while (n > 1 && ps[n - 1].state.turn === aiColor) n--
      if (aiColor && ps[n - 1].state.turn === aiColor) return ps
      return ps.slice(0, n)
    })
  }

  const changeMode = (m: Mode) => {
    setMode(m)
    newGame(m)
  }

  // Keyboard: arrows roll the torus, Esc deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return
      const pan: Record<string, [number, number]> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      }
      if (pan[e.key]) {
        e.preventDefault()
        const [dr, dc] = pan[e.key]
        setView((v) => ({ ...v, offR: v.offR + dr, offC: v.offC + dc }))
      } else if (e.key === 'Escape') {
        setSelected(null)
        setPromotionChoices(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- Derived display info ----
  const last = plies[plies.length - 1].move
  const checkSquare = inCheck(current.board, current.turn) ? findKing(current.board, current.turn) : null
  const routes = useMemo(
    () => (settings.showRoutes && checkSquare !== null ? checkRoutes(current.board, current.turn) : []),
    [settings.showRoutes, checkSquare, current],
  )

  let status: string
  if (result.kind === 'checkmate') status = `Checkmate — ${COLOR_NAME[result.winner]} wins`
  else if (result.kind === 'draw') status = `Draw by ${result.reason}`
  else if (thinking) status = `${COLOR_NAME[current.turn]} (AI) is thinking…`
  else if (watching && !started) status = 'Ready — press Start game'
  else if (watching && paused) status = `Paused — ${COLOR_NAME[current.turn]} to move`
  else status = `${COLOR_NAME[current.turn]} to move${checkSquare !== null ? ' — check!' : ''}`

  const capturedBy: Record<Color, Piece[]> = { w: [], b: [] }
  for (const p of plies) if (p.captured) capturedBy[p.captured.color === 'w' ? 'b' : 'w'].push(p.captured)

  const movePairs: [Ply, Ply | undefined][] = []
  const moves = plies.slice(1)
  for (let i = 0; i < moves.length; i += 2) movePairs.push([moves[i], moves[i + 1]])

  const moveListRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    moveListRef.current?.scrollTo({ top: moveListRef.current.scrollHeight })
  }, [plies.length])

  const pan = (dr: number, dc: number) =>
    setView((v) => ({ ...v, offR: v.offR + dr, offC: v.offC + dc }))

  return (
    <div className="torus-chess">
      <div className="app">
        <header className="topbar">
          <div className="top-panel">
            <div className="brand">
              <h1>Torus Chess</h1>
              <span className="tagline">8 × 14, wraps every way</span>
            </div>

            <div
              className="tool-group pan-group"
              title="You can also drag the board, scroll, or use the arrow keys"
            >
              <button onClick={() => pan(0, -1)} aria-label="Roll left">←</button>
              <button onClick={() => pan(-1, 0)} aria-label="Roll up">↑</button>
              <button onClick={() => pan(1, 0)} aria-label="Roll down">↓</button>
              <button onClick={() => pan(0, 1)} aria-label="Roll right">→</button>
              <button
                onClick={() => setView((v) => ({ ...v, offR: 0, offC: 0 }))}
                aria-label="Reset view"
                title="Reset view"
              >
                ⟲
              </button>
              <button onClick={() => setView((v) => ({ ...v, flipped: !v.flipped }))}>Flip</button>
            </div>

            <div className="tool-group margin-controls">
              <label>
                Margin rows
                <input
                  type="range"
                  min={0}
                  max={ROWS}
                  value={settings.ghostRows}
                  onChange={(e) => updateSettings({ ghostRows: Number(e.target.value) })}
                />
                <output>{settings.ghostRows}</output>
              </label>
              <label>
                Margin columns
                <input
                  type="range"
                  min={0}
                  max={COLS}
                  value={settings.ghostCols}
                  onChange={(e) => updateSettings({ ghostCols: Number(e.target.value) })}
                />
                <output>{settings.ghostCols}</output>
              </label>
            </div>

            <label className="tool-group toggle">
              <input
                type="checkbox"
                checked={settings.showRoutes}
                onChange={(e) => updateSettings({ showRoutes: e.target.checked })}
              />
              Show check routes
            </label>
          </div>
        </header>

        <div className="layout">
          <main className="board-area">
            <Chessboard
              state={current}
              view={view}
              onViewChange={setView}
              ghostRows={settings.ghostRows}
              ghostCols={settings.ghostCols}
              selected={selected}
              targets={targets}
              lastMove={last ? { from: last.from, to: last.to } : null}
              checkSquare={checkSquare}
              checkRoutes={routes}
              onSquareClick={onSquareClick}
            />
            {promotionChoices && (
              <div className="promotion" role="dialog" aria-label="Choose promotion">
                <span>Promote to</span>
                {promotionChoices.map((m) => (
                  <button
                    key={m.promotion}
                    className={`piece ${current.turn === 'w' ? 'white' : 'black'}`}
                    onClick={() => play(m)}
                    title={m.promotion}
                  >
                    {GLYPH[m.promotion!]}
                  </button>
                ))}
                <button className="cancel" onClick={() => setPromotionChoices(null)}>
                  Cancel
                </button>
              </div>
            )}
          </main>

          <aside className="panel">
            <div className={`status ${result.kind !== 'ongoing' ? 'over' : ''}`}>
              <span className={`turn-dot ${current.turn}`} />
              {status}
            </div>

            <section className="controls">
              <label>
                Opponent
                <select value={mode} onChange={(e) => changeMode(e.target.value as Mode)}>
                  <option value="ai-black">Computer (you play White)</option>
                  <option value="ai-white">Computer (you play Black)</option>
                  <option value="pvp">Two players, one screen</option>
                  <option value="cvc">Watch computer vs computer</option>
                </select>
              </label>
              {(watching ? (['w', 'b'] as Color[]) : aiColor ? [aiColor] : []).map((c) => (
                <label key={c}>
                  {watching ? `${COLOR_NAME[c]} AI` : 'Difficulty'}
                  <select
                    value={aiLevel[c]}
                    onChange={(e) => setAiLevel((l) => ({ ...l, [c]: Number(e.target.value) }))}
                  >
                    {DIFFICULTY.map((d, i) => (
                      <option key={d.label} value={i}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {watching && (
                <label>
                  Speed
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    {SPEEDS.map((s, i) => (
                      <option key={s.label} value={i}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {watching && (
                <div className="button-row">
                  <button
                    className={started ? undefined : 'primary'}
                    onClick={() => {
                      setStarted(true)
                      setPaused((p) => !p)
                      setStepping(false)
                    }}
                    disabled={result.kind !== 'ongoing'}
                  >
                    {!started ? '▶ Start game' : paused ? '▶ Resume' : '❚❚ Pause'}
                  </button>
                  <button
                    onClick={() => {
                      setStarted(true)
                      setStepping(true)
                    }}
                    disabled={!paused || stepping || result.kind !== 'ongoing'}
                    title="Play one move"
                  >
                    Step ›
                  </button>
                </div>
              )}
              <div className="button-row">
                <button onClick={() => newGame()}>New game</button>
                <button onClick={undo} disabled={plies.length <= 1}>
                  Undo
                </button>
              </div>
            </section>

            <section className="captures">
              {(['w', 'b'] as Color[]).map((c) => (
                <div key={c} className="capture-row">
                  <span className="capture-label">{COLOR_NAME[c]} took</span>
                  <span className="capture-pieces">
                    {capturedBy[c].map((p, i) => (
                      <span key={i} className={`piece mini ${p.color === 'w' ? 'white' : 'black'}`}>
                        {GLYPH[p.kind]}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </section>

            <section className="moves">
              <h2>Moves</h2>
              <ol ref={moveListRef}>
                {movePairs.map(([w, b], i) => (
                  <li key={i}>
                    <span className="num">{i + 1}.</span>
                    <span>{w.notation}</span>
                    <span>{b?.notation ?? ''}</span>
                  </li>
                ))}
              </ol>
            </section>

            <details className="rules">
              <summary>Rules</summary>
              <ul>
                <li>The board is 14 rows by 8 columns and wraps around: off the top is the bottom and off the left is the right.</li>
                <li>Each army has a back rank with a row of pawns on <em>both</em> sides, since the king can be attacked from behind.</li>
                <li>Pawns move away from their own back rank (see the small arrows) and promote on reaching the enemy back rank.</li>
                <li>Sliding pieces travel around the wrap until something blocks them.</li>
                <li>Castling works in either direction, even across the wrap, with the first unmoved rook the king meets. En passant is allowed.</li>
                <li>Checkmate wins. Stalemate, the fifty-move rule, threefold repetition and bare kings are draws.</li>
              </ul>
            </details>
          </aside>
        </div>
      </div>
    </div>
  )
}
