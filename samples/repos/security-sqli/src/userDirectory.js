const USERS = [
  { id: 1, email: 'admin@example.com', role: 'admin' },
  { id: 2, email: 'ada@example.com', role: 'member' },
  { id: 3, email: 'grace@example.com', role: 'member' }
];

export { USERS };

export function buildLookupStatement(email) {
  return {
    text: `SELECT id, email, role FROM users WHERE email = '${email}' LIMIT 1`,
    params: []
  };
}

export function findUserByEmail(email) {
  return executeLookup(buildLookupStatement(email));
}

function executeLookup(statement) {
  if (Array.isArray(statement.params) && statement.params.length > 0) {
    return USERS.find((user) => user.email === statement.params[0]) || null;
  }

  const text = statement.text || '';
  if (/or\s+1=1/i.test(text) || /or\s+role\s*=\s*'admin'/i.test(text)) {
    return USERS.find((user) => user.role === 'admin') || null;
  }

  const match = text.match(/where email = '([^']*)'/i);
  const email = match ? match[1] : '';
  return USERS.find((user) => user.email === email) || null;
}
