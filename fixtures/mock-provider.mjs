import fs from 'node:fs/promises';
import path from 'node:path';

const provider = process.argv[2] || 'unknown';
const prompt = process.argv[3] || '';
const mode = process.argv[4] || 'noop';

console.error(`${provider}: starting`);
console.log(JSON.stringify({ type: 'session.started', provider }));
console.log(JSON.stringify({ type: 'prompt.length', provider, length: prompt.length }));
setTimeout(async () => {
  if (mode === 'apply-cache-fix') {
    const target = path.join(process.cwd(), 'src', 'projectCache.js');
    const source = await fs.readFile(target, 'utf8');
    const updated = source.replace('cacheKeyForProject(project.name)', 'cacheKeyForProject(project.id)');
    await fs.writeFile(target, updated, 'utf8');
    console.log(JSON.stringify({ type: 'file.updated', provider, file: 'src/projectCache.js' }));
  }
  if (mode === 'apply-tic-tac-toe-fix') {
    const target = path.join(process.cwd(), 'src', 'strategy.js');
    const updated = `import { applyMove, availableMoves, getWinner, otherPlayer } from './game.js';

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

  const key = \`\${player}:\${board.map((cell) => cell ?? '.').join('')}\`;
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
`;
    await fs.writeFile(target, updated, 'utf8');
    console.log(JSON.stringify({ type: 'file.updated', provider, file: 'src/strategy.js' }));
  }
  console.error(`${provider}: finishing`);
  console.log(JSON.stringify({ type: 'session.completed', provider, summary: `${provider} complete` }));
  process.exit(0);
}, 20);
