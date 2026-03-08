import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseMove } from '../src/strategy.js';

test('takes an immediate win when available', () => {
  const board = ['X', 'X', null, 'O', null, 'O', null, null, null];
  assert.equal(chooseMove(board, 'X'), 2);
});

test('blocks an immediate loss when the opponent threatens a row', () => {
  const board = ['O', 'O', null, 'X', null, null, 'X', null, null];
  assert.equal(chooseMove(board, 'X'), 2);
});
