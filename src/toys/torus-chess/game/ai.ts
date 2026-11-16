// A simple torus-chess opponent: negamax with alpha-beta pruning, MVV-LVA move
// ordering, and a short quiescence search over captures.

import {
  applyMove, BACK_RANK, enemy, inCheck, pseudoMoves, ROWS, rowOf, mod, SIZE,
  type GameState, type Kind, type Move,
} from './rules.ts'

const VALUE: Record<Kind, number> = { P: 100, N: 300, B: 320, R: 500, Q: 900, K: 0 }
// Bonus by number of steps the pawn has advanced (it promotes after 6).
const PAWN_PROGRESS = [0, 4, 10, 20, 35, 60, 0]
const MATE = 100000
const QUIESCENCE_DEPTH = 4

export function evaluate(state: GameState): number {
  let score = 0
  const { board } = state
  for (let s = 0; s < SIZE; s++) {
    const p = board[s]
    if (!p) continue
    let v = VALUE[p.kind]
    if (p.kind === 'P') {
      const remaining = mod((BACK_RANK[enemy(p.color)] - rowOf(s)) * (p.dir ?? 1), ROWS)
      v += PAWN_PROGRESS[Math.max(0, 6 - remaining)] ?? 0
    }
    score += p.color === state.turn ? v : -v
  }
  return score
}

function captureScore(state: GameState, m: Move): number {
  const victim = state.board[m.to]
  const attacker = state.board[m.from]!
  let s = 0
  if (victim) s += 10 * VALUE[victim.kind] - VALUE[attacker.kind] + 10000
  else if (m.enPassant !== undefined) s += 10000
  if (m.promotion) s += VALUE[m.promotion] + 5000
  return s
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  return moves
    .map((m) => ({ m, s: captureScore(state, m) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m)
}

interface SearchStats {
  nodes: number
}

function quiesce(state: GameState, alpha: number, beta: number, depth: number, stats: SearchStats): number {
  stats.nodes++
  const standPat = evaluate(state)
  if (depth === 0 || standPat >= beta) return standPat
  if (standPat > alpha) alpha = standPat
  const mover = state.turn
  const tactical = pseudoMoves(state).filter(
    (m) => state.board[m.to] || m.enPassant !== undefined || m.promotion === 'Q',
  )
  for (const m of orderMoves(state, tactical)) {
    const next = applyMove(state, m)
    if (inCheck(next.board, mover)) continue
    const score = -quiesce(next, -beta, -alpha, depth - 1, stats)
    if (score >= beta) return score
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(
  state: GameState, depth: number, alpha: number, beta: number, ply: number, stats: SearchStats,
): number {
  if (depth === 0) return quiesce(state, alpha, beta, QUIESCENCE_DEPTH, stats)
  stats.nodes++
  const mover = state.turn
  let best = -Infinity
  let anyLegal = false
  for (const m of orderMoves(state, pseudoMoves(state))) {
    const next = applyMove(state, m)
    if (inCheck(next.board, mover)) continue
    anyLegal = true
    const score = -negamax(next, depth - 1, -beta, -alpha, ply + 1, stats)
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  if (!anyLegal) return inCheck(state.board, mover) ? -MATE + ply : 0
  return best
}

/** Pick a move for the side to move. Returns null if there are no legal moves. */
export function findBestMove(state: GameState, depth: number): Move | null {
  const stats: SearchStats = { nodes: 0 }
  const mover = state.turn
  const scored: { m: Move; score: number }[] = []
  let alpha = -Infinity
  for (const m of orderMoves(state, pseudoMoves(state))) {
    const next = applyMove(state, m)
    if (inCheck(next.board, mover)) continue
    // Search each root move with a window just below alpha, so moves that
    // tie for best get exact scores and can be picked at random.
    const score = -negamax(next, depth - 1, -Infinity, -(alpha - 1), 1, stats)
    scored.push({ m, score })
    if (score > alpha) alpha = score
  }
  if (scored.length === 0) return null
  const best = Math.max(...scored.map((x) => x.score))
  const top = scored.filter((x) => x.score >= best)
  return top[Math.floor(Math.random() * top.length)].m
}
