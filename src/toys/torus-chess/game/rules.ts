// Torus chess rules engine.
//
// The board is 14 rows x 8 columns and wraps in both directions (a torus).
// Each army occupies three rows: a pawn row, the back rank, and another pawn
// row. Each pawn row moves away from its own back rank, toward the enemy,
// and promotes on reaching the enemy back rank. There are four empty rows
// between the armies on each side.
//
// Row layout (row 0 at the top of the default view):
//   0-1   empty
//   2     black pawns, moving up (-1)
//   3     black back rank
//   4     black pawns, moving down (+1)
//   5-8   empty
//   9     white pawns, moving up (-1)
//   10    white back rank
//   11    white pawns, moving down (+1)
//   12-13 empty

export const ROWS = 14
export const COLS = 8
export const SIZE = ROWS * COLS

export type Color = 'w' | 'b'
export type Kind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'

export interface Piece {
  color: Color
  kind: Kind
  moved: boolean
  /** Row direction a pawn moves in (+1 = down, -1 = up). Pawns only. */
  dir?: 1 | -1
}

export interface Move {
  from: number
  to: number
  promotion?: Kind
  /** Square of the pawn captured en passant. */
  enPassant?: number
  /** Pawn moved two squares. */
  double?: boolean
  castle?: { rookFrom: number; rookTo: number }
}

export interface GameState {
  board: (Piece | null)[]
  turn: Color
  /** Square a pawn skipped on its last double step, capturable en passant. */
  epTarget: number | null
  /** The pawn that made that double step. */
  epPawn: number | null
  /** Half-moves since the last capture or pawn move (fifty-move rule). */
  halfmove: number
  fullmove: number
}

export const BACK_RANK: Record<Color, number> = { b: 3, w: 10 }
export const PROMOTION_KINDS: Kind[] = ['Q', 'R', 'B', 'N']
const BACK_ROW: Kind[] = ['R', 'N', 'B', 'K', 'Q', 'B', 'N', 'R']

export const mod = (n: number, m: number) => ((n % m) + m) % m
export const sq = (r: number, c: number) => mod(r, ROWS) * COLS + mod(c, COLS)
export const rowOf = (s: number) => Math.floor(s / COLS)
export const colOf = (s: number) => s % COLS
export const enemy = (c: Color): Color => (c === 'w' ? 'b' : 'w')

const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ALL_DIRS = [...ORTHO, ...DIAG]
const KNIGHT: [number, number][] = [
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
]

export function initialState(): GameState {
  const board: (Piece | null)[] = new Array(SIZE).fill(null)
  const army = (color: Color, back: number) => {
    for (let c = 0; c < COLS; c++) {
      board[sq(back, c)] = { color, kind: BACK_ROW[c], moved: false }
      board[sq(back - 1, c)] = { color, kind: 'P', moved: false, dir: -1 }
      board[sq(back + 1, c)] = { color, kind: 'P', moved: false, dir: 1 }
    }
  }
  army('b', BACK_RANK.b)
  army('w', BACK_RANK.w)
  return { board, turn: 'w', epTarget: null, epPawn: null, halfmove: 0, fullmove: 1 }
}

/** Is square `target` attacked by any piece of color `by`? */
export function isAttacked(board: (Piece | null)[], target: number, by: Color): boolean {
  const r = rowOf(target)
  const c = colOf(target)

  for (let i = 0; i < ALL_DIRS.length; i++) {
    const [dr, dc] = ALL_DIRS[i]
    const diagonal = i >= 4
    for (let k = 1; ; k++) {
      const s = sq(r + dr * k, c + dc * k)
      if (s === target) break // ray wrapped all the way around
      const p = board[s]
      if (!p) continue
      if (p.color === by) {
        if (k === 1 && p.kind === 'K') return true
        if (p.kind === 'Q') return true
        if (diagonal ? p.kind === 'B' : p.kind === 'R') return true
      }
      break
    }
  }

  for (const [dr, dc] of KNIGHT) {
    const p = board[sq(r + dr, c + dc)]
    if (p && p.color === by && p.kind === 'N') return true
  }

  // A pawn at (pr, pc) with direction d attacks (pr + d, pc ± 1).
  for (const d of [1, -1] as const) {
    for (const dc of [1, -1]) {
      const p = board[sq(r - d, c - dc)]
      if (p && p.color === by && p.kind === 'P' && p.dir === d) return true
    }
  }
  return false
}

export interface CheckRoute {
  attacker: number
  /** Squares strictly between the attacker and the target, in order from the target outward. */
  path: number[]
  /** Board step from the target toward the attacker, e.g. [-1, 1]. Knights use their jump. */
  dir: [number, number]
}

/**
 * Every way color `by` attacks `target`. A single piece can appear more than
 * once: on a torus a rook on the king's row attacks from both sides when the
 * rest of the row is empty.
 */
export function attackRoutes(board: (Piece | null)[], target: number, by: Color): CheckRoute[] {
  const routes: CheckRoute[] = []
  const r = rowOf(target)
  const c = colOf(target)

  for (let i = 0; i < ALL_DIRS.length; i++) {
    const [dr, dc] = ALL_DIRS[i]
    const diagonal = i >= 4
    const path: number[] = []
    for (let k = 1; ; k++) {
      const s = sq(r + dr * k, c + dc * k)
      if (s === target) break
      const p = board[s]
      if (!p) {
        path.push(s)
        continue
      }
      if (
        p.color === by &&
        ((k === 1 && p.kind === 'K') || p.kind === 'Q' || (diagonal ? p.kind === 'B' : p.kind === 'R'))
      ) {
        routes.push({ attacker: s, path, dir: [dr, dc] })
      }
      break
    }
  }

  for (const [dr, dc] of KNIGHT) {
    const s = sq(r + dr, c + dc)
    const p = board[s]
    if (p && p.color === by && p.kind === 'N') routes.push({ attacker: s, path: [], dir: [dr, dc] })
  }

  for (const d of [1, -1] as const) {
    for (const dc of [1, -1]) {
      const s = sq(r - d, c - dc)
      const p = board[s]
      if (p && p.color === by && p.kind === 'P' && p.dir === d) {
        routes.push({ attacker: s, path: [], dir: [-d, -dc] })
      }
    }
  }
  return routes
}

/** Routes of every piece currently giving check to `color`'s king. */
export function checkRoutes(board: (Piece | null)[], color: Color): CheckRoute[] {
  const k = findKing(board, color)
  return k < 0 ? [] : attackRoutes(board, k, enemy(color))
}

export function findKing(board: (Piece | null)[], color: Color): number {
  for (let s = 0; s < SIZE; s++) {
    const p = board[s]
    if (p && p.kind === 'K' && p.color === color) return s
  }
  return -1
}

export function inCheck(board: (Piece | null)[], color: Color): boolean {
  const k = findKing(board, color)
  return k >= 0 && isAttacked(board, k, enemy(color))
}

/** Moves that follow piece movement rules but may leave the king in check. Castling is excluded. */
export function pseudoMovesFrom(state: GameState, from: number, out: Move[] = []): Move[] {
  const { board } = state
  const p = board[from]
  if (!p) return out
  const r = rowOf(from)
  const c = colOf(from)
  const seen = new Set<number>()
  const add = (to: number) => {
    if (seen.has(to)) return
    seen.add(to)
    out.push({ from, to })
  }
  const step = (dirs: [number, number][]) => {
    for (const [dr, dc] of dirs) {
      const to = sq(r + dr, c + dc)
      const t = board[to]
      if (to !== from && (!t || t.color !== p.color)) add(to)
    }
  }
  const slide = (dirs: [number, number][]) => {
    for (const [dr, dc] of dirs) {
      for (let k = 1; ; k++) {
        const to = sq(r + dr * k, c + dc * k)
        if (to === from) break
        const t = board[to]
        if (!t) {
          add(to)
          continue
        }
        if (t.color !== p.color) add(to)
        break
      }
    }
  }

  switch (p.kind) {
    case 'N':
      step(KNIGHT)
      break
    case 'K':
      step(ALL_DIRS)
      break
    case 'R':
      slide(ORTHO)
      break
    case 'B':
      slide(DIAG)
      break
    case 'Q':
      slide(ALL_DIRS)
      break
    case 'P': {
      const d = p.dir ?? 1
      const promoRow = BACK_RANK[enemy(p.color)]
      const pushPawn = (m: Move) => {
        if (rowOf(m.to) === promoRow) {
          for (const k of PROMOTION_KINDS) out.push({ ...m, promotion: k })
        } else out.push(m)
      }
      const one = sq(r + d, c)
      if (!board[one]) {
        pushPawn({ from, to: one })
        const two = sq(r + 2 * d, c)
        if (!p.moved && !board[two] && rowOf(two) !== promoRow) {
          out.push({ from, to: two, double: true })
        }
      }
      for (const dc of [-1, 1]) {
        const to = sq(r + d, c + dc)
        const t = board[to]
        if (t && t.color !== p.color) pushPawn({ from, to })
        else if (!t && to === state.epTarget && state.epPawn !== null) {
          const victim = board[state.epPawn]
          if (victim && victim.color !== p.color) {
            out.push({ from, to, enPassant: state.epPawn })
          }
        }
      }
      break
    }
  }
  return out
}

/**
 * Castling: the king moves two squares toward an unmoved rook on its row, and
 * the rook lands on the square the king passed. On the torus the search
 * continues across the wrap, so a king can castle "around the back" with
 * whichever rook it reaches first in that direction.
 */
function castlingMoves(state: GameState, from: number, out: Move[]) {
  const { board } = state
  const king = board[from]
  if (!king || king.kind !== 'K' || king.moved) return
  const them = enemy(king.color)
  if (isAttacked(board, from, them)) return
  const r = rowOf(from)
  const c = colOf(from)
  for (const dc of [-1, 1]) {
    let rookSq = -1
    for (let k = 1; k < COLS; k++) {
      const s = sq(r, c + dc * k)
      const p = board[s]
      if (!p) continue
      if (p.kind === 'R' && p.color === king.color && !p.moved && k >= 3) rookSq = s
      break
    }
    if (rookSq < 0) continue
    const pass = sq(r, c + dc)
    const dest = sq(r, c + 2 * dc)
    // Check the squares the king crosses with the king lifted off the board,
    // so a ray that wraps through the king's own square counts.
    const lifted = board.slice()
    lifted[from] = null
    if (isAttacked(lifted, pass, them) || isAttacked(lifted, dest, them)) continue
    out.push({ from, to: dest, castle: { rookFrom: rookSq, rookTo: pass } })
  }
}

export function applyMove(state: GameState, m: Move): GameState {
  const board = state.board.slice()
  const p = board[m.from]!
  const captured = board[m.to]
  board[m.from] = null
  board[m.to] = m.promotion
    ? { color: p.color, kind: m.promotion, moved: true }
    : { ...p, moved: true }
  if (m.enPassant !== undefined) board[m.enPassant] = null
  if (m.castle) {
    const rook = board[m.castle.rookFrom]!
    board[m.castle.rookFrom] = null
    board[m.castle.rookTo] = { ...rook, moved: true }
  }
  let epTarget: number | null = null
  let epPawn: number | null = null
  if (m.double) {
    epTarget = sq(rowOf(m.from) + (p.dir ?? 1), colOf(m.from))
    epPawn = m.to
  }
  const resetClock = p.kind === 'P' || !!captured || m.enPassant !== undefined
  return {
    board,
    turn: enemy(state.turn),
    epTarget,
    epPawn,
    halfmove: resetClock ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  }
}

export function legalMovesFrom(state: GameState, from: number): Move[] {
  const p = state.board[from]
  if (!p || p.color !== state.turn) return []
  const pseudo = pseudoMovesFrom(state, from)
  if (p.kind === 'K') castlingMoves(state, from, pseudo)
  return pseudo.filter((m) => !inCheck(applyMove(state, m).board, p.color))
}

export function legalMoves(state: GameState): Move[] {
  const out: Move[] = []
  for (let s = 0; s < SIZE; s++) {
    const p = state.board[s]
    if (p && p.color === state.turn) out.push(...legalMovesFrom(state, s))
  }
  return out
}

/** Pseudo-legal moves for the side to move, including castling (used by the AI). */
export function pseudoMoves(state: GameState): Move[] {
  const out: Move[] = []
  for (let s = 0; s < SIZE; s++) {
    const p = state.board[s]
    if (!p || p.color !== state.turn) continue
    pseudoMovesFrom(state, s, out)
    if (p.kind === 'K') castlingMoves(state, s, out)
  }
  return out
}

export type Outcome =
  | { kind: 'ongoing' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'draw'; reason: 'stalemate' | 'fifty-move rule' | 'threefold repetition' | 'insufficient material' }

/** Key identifying a position for repetition detection. */
export function positionKey(state: GameState): string {
  let s = state.turn
  for (const p of state.board) {
    if (!p) s += '.'
    else {
      s += p.color === 'w' ? p.kind : p.kind.toLowerCase()
      if (p.kind === 'P') s += p.dir === 1 ? 'v' : '^'
      if ((p.kind === 'K' || p.kind === 'R') && !p.moved) s += '*'
    }
  }
  return s + (state.epTarget ?? '-')
}

function insufficientMaterial(board: (Piece | null)[]): boolean {
  const minors: Piece[] = []
  for (const p of board) {
    if (!p || p.kind === 'K') continue
    if (p.kind === 'B' || p.kind === 'N') minors.push(p)
    else return false
  }
  return minors.length <= 1
}

/** `history` holds every position so far, including `state` as the last entry. */
export function outcome(state: GameState, history: GameState[]): Outcome {
  if (legalMoves(state).length === 0) {
    return inCheck(state.board, state.turn)
      ? { kind: 'checkmate', winner: enemy(state.turn) }
      : { kind: 'draw', reason: 'stalemate' }
  }
  if (insufficientMaterial(state.board)) return { kind: 'draw', reason: 'insufficient material' }
  if (state.halfmove >= 100) return { kind: 'draw', reason: 'fifty-move rule' }
  const key = positionKey(state)
  if (history.filter((h) => positionKey(h) === key).length >= 3) {
    return { kind: 'draw', reason: 'threefold repetition' }
  }
  return { kind: 'ongoing' }
}

export const squareName = (s: number) => 'abcdefgh'[colOf(s)] + (ROWS - rowOf(s))

/** Long algebraic notation, e.g. "Nb4-c6", "e5xd6 e.p.", "O-O", "a9-a10=Q+". */
export function moveNotation(before: GameState, m: Move, after: GameState): string {
  const p = before.board[m.from]!
  let text: string
  if (m.castle) {
    const dist = Math.min(
      mod(colOf(m.castle.rookFrom) - colOf(m.from), COLS),
      mod(colOf(m.from) - colOf(m.castle.rookFrom), COLS),
    )
    text = dist <= 3 ? 'O-O' : 'O-O-O'
  } else {
    const capture = !!before.board[m.to] || m.enPassant !== undefined
    text =
      (p.kind === 'P' ? '' : p.kind) +
      squareName(m.from) +
      (capture ? 'x' : '-') +
      squareName(m.to) +
      (m.promotion ? '=' + m.promotion : '') +
      (m.enPassant !== undefined ? ' e.p.' : '')
  }
  if (inCheck(after.board, after.turn)) {
    text += legalMoves(after).length === 0 ? '#' : '+'
  }
  return text
}
