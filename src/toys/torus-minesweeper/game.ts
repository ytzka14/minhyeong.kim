// Minesweeper on a torus: the grid wraps in both directions, so there are no
// edges or corners and every cell has exactly eight neighbours.

export type CellState = 'covered' | 'flagged' | 'revealed'

export interface Cell {
  mine: boolean
  /** Number of mines among the eight neighbours. */
  adj: number
  state: CellState
}

export type Status = 'ready' | 'playing' | 'won' | 'lost'

export interface Game {
  rows: number
  cols: number
  mines: number
  cells: Cell[]
  status: Status
  /** The mine that was clicked, when lost. */
  exploded: number | null
  revealed: number
  flags: number
}

export const mod = (n: number, m: number) => ((n % m) + m) % m

/** The eight wrapped neighbours of cell i. */
export function neighbors(rows: number, cols: number, i: number): number[] {
  const r = Math.floor(i / cols)
  const c = i % cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      out.push(mod(r + dr, rows) * cols + mod(c + dc, cols))
    }
  }
  return out
}

export function newGame(rows: number, cols: number, mines: number): Game {
  const cells: Cell[] = Array.from({ length: rows * cols }, () => ({ mine: false, adj: 0, state: 'covered' }))
  return { rows, cols, mines, cells, status: 'ready', exploded: null, revealed: 0, flags: 0 }
}

/**
 * Lay mines on the first click, keeping the clicked cell (and, when there is
 * room, its neighbours) clear so the game opens with a cascade.
 */
function layMines(game: Game, first: number, random: () => number): Cell[] {
  const { rows, cols, mines } = game
  const keepClear = new Set([first])
  if (rows * cols - 9 >= mines) for (const n of neighbors(rows, cols, first)) keepClear.add(n)
  const candidates: number[] = []
  for (let i = 0; i < rows * cols; i++) if (!keepClear.has(i)) candidates.push(i)
  // Partial Fisher–Yates: the first `mines` entries are a uniform sample.
  for (let k = 0; k < mines; k++) {
    const j = k + Math.floor(random() * (candidates.length - k))
    ;[candidates[k], candidates[j]] = [candidates[j], candidates[k]]
  }
  const cells = game.cells.map((c) => ({ ...c, mine: false, adj: 0 }))
  for (let k = 0; k < mines; k++) cells[candidates[k]].mine = true
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) for (const n of neighbors(rows, cols, i)) cells[n].adj++
  }
  return cells
}

/** Reveal the given cells, cascading through zeros. Mutates `cells`. */
function open(game: Game, cells: Cell[], start: number[]): { revealed: number; hit: number | null } {
  let revealed = 0
  let hit: number | null = null
  const stack = [...start]
  while (stack.length) {
    const i = stack.pop()!
    const cell = cells[i]
    if (cell.state !== 'covered') continue
    cell.state = 'revealed'
    if (cell.mine) {
      hit ??= i
      continue
    }
    revealed++
    if (cell.adj === 0) for (const n of neighbors(game.rows, game.cols, i)) stack.push(n)
  }
  return { revealed, hit }
}

function settle(game: Game, cells: Cell[], revealed: number, hit: number | null): Game {
  const total = game.revealed + revealed
  if (hit !== null) {
    // Show every mine; flags stay so wrong ones can be marked.
    for (const c of cells) if (c.mine && c.state === 'covered') c.state = 'revealed'
    return { ...game, cells, revealed: total, status: 'lost', exploded: hit }
  }
  if (total === game.rows * game.cols - game.mines) {
    let flags = game.flags
    for (const c of cells) {
      if (c.mine && c.state !== 'flagged') {
        c.state = 'flagged'
        flags++
      }
    }
    return { ...game, cells, revealed: total, flags, status: 'won' }
  }
  return { ...game, cells, revealed: total, status: 'playing' }
}

const over = (g: Game) => g.status === 'won' || g.status === 'lost'

export function reveal(game: Game, i: number, random: () => number = Math.random): Game {
  if (over(game) || game.cells[i].state !== 'covered') return game
  const cells = game.status === 'ready' ? layMines(game, i, random) : game.cells.map((c) => ({ ...c }))
  const { revealed, hit } = open(game, cells, [i])
  return settle(game, cells, revealed, hit)
}

/**
 * Clicking a revealed number whose neighbours already hold that many flags
 * opens all its other neighbours.
 */
export function chord(game: Game, i: number): Game {
  const cell = game.cells[i]
  if (game.status !== 'playing' || cell.state !== 'revealed' || cell.adj === 0) return game
  const ns = neighbors(game.rows, game.cols, i)
  const flagged = ns.filter((n) => game.cells[n].state === 'flagged').length
  if (flagged !== cell.adj) return game
  const toOpen = ns.filter((n) => game.cells[n].state === 'covered')
  if (toOpen.length === 0) return game
  const cells = game.cells.map((c) => ({ ...c }))
  const { revealed, hit } = open(game, cells, toOpen)
  return settle(game, cells, revealed, hit)
}

export function toggleFlag(game: Game, i: number): Game {
  if (game.status !== 'playing') return game
  const cell = game.cells[i]
  if (cell.state === 'revealed') return game
  const cells = game.cells.slice()
  const flagging = cell.state === 'covered'
  cells[i] = { ...cell, state: flagging ? 'flagged' : 'covered' }
  return { ...game, cells, flags: game.flags + (flagging ? 1 : -1) }
}
