/** Runs the chess engine away from the page, so the board never freezes while a strong bot thinks. */
import { bestMove } from './chess.js';

self.onmessage = (e) => {
  const { id, s, level } = e.data || {};
  let move = null;
  try { move = bestMove(s, level); } catch { move = null; }
  self.postMessage({ id, move });
};
