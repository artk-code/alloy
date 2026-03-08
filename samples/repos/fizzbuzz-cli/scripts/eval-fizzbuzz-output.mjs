import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const run = spawnSync(process.execPath, ['cli.js'], {
  cwd: projectRoot,
  encoding: 'utf8'
});

if (run.status !== 0) {
  process.stderr.write(run.stderr || 'FizzBuzz CLI failed to execute.\n');
  process.exit(run.status || 1);
}

const actual = run.stdout.trimEnd().split('\n');
const expected = [];
for (let value = 1; value <= 100; value += 1) {
  if (value % 15 === 0) {
    expected.push('FizzBuzz');
  } else if (value % 3 === 0) {
    expected.push('Fizz');
  } else if (value % 5 === 0) {
    expected.push('Buzz');
  } else {
    expected.push(String(value));
  }
}

const mismatches = [];
for (let index = 0; index < expected.length; index += 1) {
  if (actual[index] !== expected[index]) {
    mismatches.push(`line ${index + 1}: expected ${expected[index]} but received ${actual[index]}`);
  }
}

if (mismatches.length > 0) {
  process.stderr.write(`FizzBuzz output mismatch on ${mismatches.length} line(s).\n`);
  process.stderr.write(mismatches.slice(0, 10).join('\n') + '\n');
  process.exit(1);
}

process.stdout.write('FizzBuzz CLI output matches the canonical 1..100 sequence.\n');
