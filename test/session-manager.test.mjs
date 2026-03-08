import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { SessionManager } from '../src/session-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const mockProviderScript = path.join(projectRoot, 'fixtures/mock-provider.mjs');

test('SessionManager persists a pipe-backed session record for a real subprocess', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-sessions-'));
  const sessionManager = new SessionManager({ projectRoot, stateDir: stateRoot });

  const session = await sessionManager.runCommandSession({
    provider: 'codex',
    profileId: 'default',
    transport: 'pipe',
    taskId: 'task_demo',
    candidateId: 'cand_a',
    command: {
      binary: process.execPath,
      args: [mockProviderScript, 'codex', 'demo prompt', 'noop']
    },
    cwd: projectRoot
  });

  const record = JSON.parse(await fs.readFile(session.paths.record_path, 'utf8'));
  const stdout = await fs.readFile(session.paths.stdout_path, 'utf8');

  assert.equal(record.status, 'completed');
  assert.equal(record.transport, 'pipe');
  assert.equal(record.provider, 'codex');
  assert.match(stdout, /session.started/);
  assert.match(stdout, /session.completed/);

  await fs.rm(stateRoot, { recursive: true, force: true });
});

test('SessionManager can execute a PTY-backed subprocess when script is available', { skip: !hasScriptUtility() }, async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-pty-sessions-'));
  const sessionManager = new SessionManager({ projectRoot, stateDir: stateRoot });

  const session = await sessionManager.runCommandSession({
    provider: 'claude-code',
    profileId: 'default',
    transport: 'pty',
    taskId: 'task_demo',
    candidateId: 'cand_b',
    command: {
      binary: process.execPath,
      args: [mockProviderScript, 'claude-code', 'demo prompt', 'noop']
    },
    cwd: projectRoot
  });

  const record = JSON.parse(await fs.readFile(session.paths.record_path, 'utf8'));
  const stdout = await fs.readFile(session.paths.stdout_path, 'utf8');

  assert.equal(record.status, 'completed');
  assert.equal(record.transport, 'pty');
  assert.match(stdout, /session.started/);

  await fs.rm(stateRoot, { recursive: true, force: true });
});

function hasScriptUtility() {
  const check = spawnSync('sh', ['-lc', 'command -v script >/dev/null 2>&1']);
  return check.status === 0;
}
