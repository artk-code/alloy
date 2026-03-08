import { applyMove, availableMoves, getWinner, otherPlayer } from './game.js';

const memo = new Map();

export function chooseMove(board, player) {
  const moves = availableMoves(board);
  if (moves.length === 0) {
    return -1;
  }

  let bestScore = -Infinity;
  let bestMove = moves[0];
  for (const move of moves) {
    const nextBoard = applyMove(board, move, player);
    const score = getWinner(nextBoard) === player ? 1 : -scorePosition(nextBoard, otherPlayer(player));
    if (score > bestScore || (score === bestScore && move < bestMove)) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function scorePosition(board, player) {
  const winner = getWinner(board);
  if (winner) {
    return -1;
  }

  const moves = availableMoves(board);
  if (moves.length === 0) {
    return 0;
  }

  const key = `${player}:${board.map((cell) => cell ?? '.').join('')}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  let bestScore = -Infinity;
  for (const move of moves) {
    const nextBoard = applyMove(board, move, player);
    const score = getWinner(nextBoard) === player ? 1 : -scorePosition(nextBoard, otherPlayer(player));
    bestScore = Math.max(bestScore, score);
    if (bestScore === 1) {
      break;
    }
  }

  memo.set(key, bestScore);
  return bestScore;
}
