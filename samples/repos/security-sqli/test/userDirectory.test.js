import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLookupStatement, findUserByEmail } from '../src/userDirectory.js';

test('findUserByEmail returns the exact user for a safe lookup', () => {
  const user = findUserByEmail('ada@example.com');

  assert.deepEqual(user, {
    id: 2,
    email: 'ada@example.com',
    role: 'member'
  });
});

test('findUserByEmail returns null when the user does not exist', () => {
  assert.equal(findUserByEmail('missing@example.com'), null);
});

test('findUserByEmail does not allow SQL injection to escalate the lookup', () => {
  const injected = "missing@example.com' OR role = 'admin' --";

  assert.equal(findUserByEmail(injected), null);
});

test('buildLookupStatement uses placeholder params instead of raw interpolation', () => {
  const statement = buildLookupStatement('ada@example.com');

  assert.equal(statement.text, 'SELECT id, email, role FROM users WHERE email = ? LIMIT 1');
  assert.deepEqual(statement.params, ['ada@example.com']);
  assert.doesNotMatch(statement.text, /ada@example\.com/);
});
