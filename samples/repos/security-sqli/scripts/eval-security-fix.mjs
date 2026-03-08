import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLookupStatement, findUserByEmail } from '../src/userDirectory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsPath = path.join(__dirname, '..', 'docs', 'security-fix.md');

const failures = [];
const injected = "missing@example.com' OR role = 'admin' --";
const lookupResult = findUserByEmail(injected);

if (lookupResult !== null) {
  failures.push('Injected lookup still returns a user. The fix must block SQL injection behavior.');
}

const statement = buildLookupStatement('ada@example.com');
if (statement.text.includes('ada@example.com')) {
  failures.push('Lookup statement still interpolates raw email text.');
}
if (!/\?/.test(statement.text)) {
  failures.push('Lookup statement must use a placeholder token.');
}
if (!Array.isArray(statement.params) || statement.params.length !== 1 || statement.params[0] !== 'ada@example.com') {
  failures.push('Lookup statement must carry the email as a single parameter.');
}

const doc = await fs.readFile(docsPath, 'utf8').catch(() => '');
if (!doc.trim()) {
  failures.push('docs/security-fix.md is missing.');
} else {
  const requiredPhrases = [
    'sql injection',
    'root cause',
    'fix',
    'verification'
  ];
  for (const phrase of requiredPhrases) {
    if (!doc.toLowerCase().includes(phrase)) {
      failures.push(`docs/security-fix.md must mention '${phrase}'.`);
    }
  }
}

if (failures.length > 0) {
  console.error('Security eval failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Security eval passed: lookup is parameterized, exploit is blocked, and documentation is present.');
