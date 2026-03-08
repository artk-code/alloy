import test from 'node:test';
import assert from 'node:assert/strict';

import { fizzbuzzLine, generateFizzBuzz } from '../src/fizzbuzz.js';

test('fizzbuzzLine handles standard values', () => {
  assert.equal(fizzbuzzLine(1), '1');
  assert.equal(fizzbuzzLine(3), 'Fizz');
  assert.equal(fizzbuzzLine(5), 'Buzz');
  assert.equal(fizzbuzzLine(15), 'FizzBuzz');
});

test('generateFizzBuzz emits 100 lines with canonical markers', () => {
  const lines = generateFizzBuzz(100);

  assert.equal(lines.length, 100);
  assert.equal(lines[0], '1');
  assert.equal(lines[14], 'FizzBuzz');
  assert.equal(lines[29], 'FizzBuzz');
  assert.equal(lines[98], 'Fizz');
  assert.equal(lines[99], 'Buzz');
});
