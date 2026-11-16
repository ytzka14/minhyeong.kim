import { useCallback } from 'react'
import TorusCanvas, { type RGB, type TorusCell } from '../shared/TorusCanvas.tsx'
import { COLS, ROWS, sq, type GameState } from './game/rules.ts'
import { GLYPH } from './game/view.ts'

interface Props {
  state: GameState
  lastMove: { from: number; to: number } | null
  checkSquare: number | null
}

const LIGHT_SQ: RGB = [233, 220, 192]
const DARK_SQ: RGB = [156, 122, 84]
const LAST_TINT: RGB = [224, 190, 60]
const CHECK_TINT: RGB = [230, 40, 30]
const PIECE_FONT = "'Segoe UI Symbol', 'Apple Symbols', 'DejaVu Sans', 'Noto Sans Symbols 2', serif"

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** The current position drawn on a 3D torus. */
export default function TorusView({ state, lastMove, checkSquare }: Props) {
  const cellAt = useCallback(
    (r: number, c: number): TorusCell => {
      const s = sq(r, c)
      let fill = (r + c) % 2 === 0 ? LIGHT_SQ : DARK_SQ
      if (lastMove && (lastMove.from === s || lastMove.to === s)) fill = mix(fill, LAST_TINT, 0.45)
      if (checkSquare === s) fill = mix(fill, CHECK_TINT, 0.7)
      const p = state.board[s]
      if (!p) return { fill }
      const white = p.color === 'w'
      return {
        fill,
        label: GLYPH[p.kind],
        labelFont: PIECE_FONT,
        labelColor: white ? '#fffaf0' : '#1f1b18',
        labelStroke: white ? '#2a2420' : 'rgb(255 255 255 / 0.35)',
      }
    },
    [state, lastMove, checkSquare],
  )

  return (
    <TorusCanvas
      rows={ROWS}
      cols={COLS}
      cellAt={cellAt}
      className="torus-canvas"
      ariaLabel="The current position drawn on a 3D torus"
    />
  )
}
