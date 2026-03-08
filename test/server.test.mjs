import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { contentTypeForStaticPath, createTaskFile } from '../src/web/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('contentTypeForStaticPath serves browser modules as javascript', () => {
  assert.equal(contentTypeForStaticPath('/tmp/index.html'), 'text/html');
  assert.equal(contentTypeForStaticPath('/tmp/styles.css'), 'text/css');
  assert.equal(contentTypeForStaticPath('/tmp/app.js'), 'application/javascript');
  assert.equal(contentTypeForStaticPath('/tmp/view-state.mjs'), 'application/javascript');
});

test('createTaskFile writes a new task markdown file from a filesystem source path', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-task-create-'));
  const sourceMarkdown = await fs.readFile(
    path.join(projectRoot, 'samples', 'tasks', 'tic-tac-toe-perfect-play.task.md'),
    'utf8'
  );
  const sourcePath = path.join(tempRoot, 'seed-task.md');
  const tasksDir = path.join(tempRoot, 'samples', 'tasks');

  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(sourcePath, sourceMarkdown, 'utf8');

  const payload = await createTaskFile(tempRoot, {
    output_name: 'imported-demo',
    source_path: 'seed-task.md',
    markdown: ''
  });

  assert.equal(payload.task_id, 'task_20260308_tic_tac_toe_perfect_play');
  assert.match(payload.markdown_path, /imported-demo\.task\.md$/);
  assert.ok(Array.isArray(payload.security_warnings));
  assert.match(payload.security_warnings[0], /task input/i);

  const written = await fs.readFile(payload.markdown_path, 'utf8');
  assert.match(written, /Upgrade the tic-tac-toe engine to perfect play/);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('createTaskFile rejects non-markdown imports', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-task-create-invalid-'));
  const sourcePath = path.join(tempRoot, 'seed-task.txt');
  const tasksDir = path.join(tempRoot, 'samples', 'tasks');

  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(sourcePath, 'not markdown', 'utf8');

  await assert.rejects(
    () => createTaskFile(tempRoot, {
      output_name: 'bad-import',
      source_path: 'seed-task.txt',
      markdown: ''
    }),
    /Only markdown imports are supported/
  );

  await fs.rm(tempRoot, { recursive: true, force: true });
});
