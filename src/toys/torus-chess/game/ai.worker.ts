import { findBestMove } from './ai.ts'
import type { GameState } from './rules.ts'

export interface AiRequest {
  id: number
  state: GameState
  depth: number
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, state, depth } = e.data
  const move = findBestMove(state, depth)
  self.postMessage({ id, move })
}
