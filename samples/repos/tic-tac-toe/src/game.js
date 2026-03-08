export const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

export function createBoard(cells = Array(9).fill(null)) {
  if (!Array.isArray(cells) || cells.length !== 9) {
    throw new Error('Board must contain exactly 9 cells.');
  }
  return cells.map((cell) => {
    if (cell !== 'X' && cell !== 'O' && cell !== null) {
      throw new Error(`Unsupported board cell: ${cell}`);
    }
    return cell;
  });
}

export function availableMoves(board) {
  return board.reduce((moves, cell, index) => {
    if (cell === null) {
      moves.push(index);
    }
    return moves;
  }, []);
}

export function getWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

export function applyMove(board, move, player) {
  if (board[move] !== null) {
    throw new Error(`Illegal move ${move}; cell already occupied.`);
  }
  return board.map((cell, index) => (index === move ? player : cell));
}

export function otherPlayer(player) {
  return player === 'X' ? 'O' : 'X';
}

export function formatBoard(board) {
  const renderCell = (cell) => cell ?? '.';
  return [
    `${renderCell(board[0])} ${renderCell(board[1])} ${renderCell(board[2])}`,
    `${renderCell(board[3])} ${renderCell(board[4])} ${renderCell(board[5])}`,
    `${renderCell(board[6])} ${renderCell(board[7])} ${renderCell(board[8])}`
  ].join('\n');
}
