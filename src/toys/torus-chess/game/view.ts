import { COLS, mod, ROWS, type Kind } from './rules.ts'

export interface View {
  /** Row offset of the view (the board wraps, so any integer is valid). */
  offR: number
  offC: number
  /** Rotate 180 degrees (black at the bottom). */
  flipped: boolean
}

export const GLYPH: Record<Kind, string> = {
  K: '♚︎', Q: '♛︎', R: '♜︎',
  B: '♝︎', N: '♞︎', P: '♟︎',
}

/** Map a display cell (i, j) to board (row, col) under the current view. */
export function boardCoords(view: View, i: number, j: number): [number, number] {
  let r = mod(i + view.offR, ROWS)
  let c = mod(j + view.offC, COLS)
  if (view.flipped) {
    r = ROWS - 1 - r
    c = COLS - 1 - c
  }
  return [r, c]
}
