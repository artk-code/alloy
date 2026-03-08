import test from 'node:test';
import assert from 'node:assert/strict';

import { fromRoman, toRoman } from '../src/roman.js';

test('toRoman emits canonical subtractive forms', () => {
  assert.equal(toRoman(4), 'IV');
  assert.equal(toRoman(9), 'IX');
  assert.equal(toRoman(58), 'LVIII');
  assert.equal(toRoman(944), 'CMXLIV');
});

test('fromRoman round-trips canonical numerals', () => {
  assert.equal(fromRoman('IV'), 4);
  assert.equal(fromRoman('IX'), 9);
  assert.equal(fromRoman('MCMXCIV'), 1994);
});
