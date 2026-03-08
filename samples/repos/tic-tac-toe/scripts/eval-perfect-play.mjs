import { applyMove, availableMoves, createBoard, formatBoard, getWinner, otherPlayer } from '../src/game.js';
import { chooseMove } from '../src/strategy.js';

const memo = new Map();
const failures = [];
const visited = new Set();
const states = [];

walkReachableStates(createBoard(), 'X');

for (const state of states) {
  const { board, player } = state;
  const expectedMoves = getOptimalMoves(board, player);
  const actualMove = chooseMove(board.slice(), player);
  const legalMoves = availableMoves(board);

  if (!legalMoves.includes(actualMove)) {
    failures.push({
      reason: 'illegal_move',
      player,
      board,
      expectedMoves,
      actualMove
    });
    continue;
  }

  if (!expectedMoves.includes(actualMove)) {
    failures.push({
      reason: 'suboptimal_move',
      player,
      board,
      expectedMoves,
      actualMove
    });
  }
}

if (failures.length > 0) {
  console.error(`Perfect-play eval failed on ${failures.length} of ${states.length} reachable states.`);
  for (const failure of failures.slice(0, 5)) {
    console.error('');
    console.error(`Reason: ${failure.reason}`);
    console.error(`Player: ${failure.player}`);
    console.error(`Expected one of: ${failure.expectedMoves.join(', ')}`);
    console.error(`Actual move: ${failure.actualMove}`);
    console.error(formatBoard(failure.board));
  }
  process.exit(1);
}

console.log(`Perfect-play eval passed on ${states.length} reachable states.`);

function walkReachableStates(board, player) {
  const key = `${serialize(board)}:${player}`;
  if (visited.has(key)) {
    return;
  }
  visited.add(key);

  if (getWinner(board) || availableMoves(board).length === 0) {
    return;
  }

  states.push({ board, player });
  for (const move of availableMoves(board)) {
    const nextBoard = applyMove(board, move, player);
    walkReachableStates(nextBoard, otherPlayer(player));
  }
}

function getOptimalMoves(board, player) {
  let bestScore = -Infinity;
  const bestMoves = [];

  for (const move of availableMoves(board)) {
    const nextBoard = applyMove(board, move, player);
    let score = 1;
    if (getWinner(nextBoard) !== player) {
      score = -solve(nextBoard, otherPlayer(player));
    }

    if (score > bestScore) {
      bestScore = score;
      bestMoves.length = 0;
      bestMoves.push(move);
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves;
}

function solve(board, player) {
  const key = `${serialize(board)}:${player}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  if (getWinner(board)) {
    memo.set(key, -1);
    return -1;
  }

  const moves = availableMoves(board);
  if (moves.length === 0) {
    memo.set(key, 0);
    return 0;
  }

  let bestScore = -Infinity;
  for (const move of moves) {
    const nextBoard = applyMove(board, move, player);
    let score = 1;
    if (getWinner(nextBoard) !== player) {
      score = -solve(nextBoard, otherPlayer(player));
    }
    bestScore = Math.max(bestScore, score);
    if (bestScore === 1) {
      break;
    }
  }

  memo.set(key, bestScore);
  return bestScore;
}

function serialize(board) {
  return board.map((cell) => cell ?? '.').join('');
}
