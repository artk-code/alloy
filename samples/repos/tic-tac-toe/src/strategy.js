import { availableMoves } from './game.js';

export function chooseMove(board, player) {
  const moves = availableMoves(board);
  if (moves.length === 0) {
    return -1;
  }

  if (board[4] === null) {
    return 4;
  }

  return moves[0];
}
