import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerminalLoginLaunch } from '../src/auth-launch.mjs';
import { getTaskDetail, listTaskCards } from '../src/web/data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('listTaskCards prioritizes the tic-tac-toe demo card for the first board view', async () => {
  const cards = await listTaskCards(projectRoot);

  assert.ok(cards.length >= 3);
  assert.equal(cards[0].task_id, 'task_20260308_tic_tac_toe_perfect_play');
  assert.equal(cards[0].project_id, 'game-lab');
  assert.equal(cards[0].project_label, 'Game Lab');
  assert.equal(cards[0].source_system, 'symphony');
  assert.equal(cards[0].source_label, 'Imported card demo_card_tic_tac_toe_perfect_play');
  assert.equal(cards[0].source_task_id, 'demo_card_tic_tac_toe_perfect_play');
  assert.match(cards[0].title, /perfect play/i);
  assert.match(cards[0].acceptance_summary, /check/i);
  assert.equal(typeof cards[0].card_summary, 'string');
});

test('getTaskDetail returns markdown, parsed task data, and default run config', async () => {
  const detail = await getTaskDetail(projectRoot, 'task_20260308_tic_tac_toe_perfect_play');

  assert.ok(detail);
  assert.equal(detail.project_id, 'game-lab');
  assert.equal(detail.project_label, 'Game Lab');
  assert.match(detail.markdown, /# Task/);
  assert.equal(detail.task.repo, 'demo/tic-tac-toe');
  assert.equal(detail.run_config.providers.length, 3);
  assert.equal(detail.run_config.providers[0].provider, 'codex');
  assert.ok(detail.run_config.providers[0].agents >= 1);
  assert.equal(detail.run_config.merge_mode, 'hybrid');
  assert.equal(detail.task_brief.repo_label, 'demo/tic-tac-toe on main');
  assert.equal(detail.task_brief.source_label, 'Imported card demo_card_tic_tac_toe_perfect_play');
  assert.match(detail.latest_run_overview.execution_summary, /candidate/i);
  assert.equal(detail.latest_run_overview.merge_mode, detail.run_config.merge_mode);
  assert.equal(detail.comparison_view.decision.mode, 'pending');
  assert.ok(Array.isArray(detail.comparison_view.rows));
  assert.ok(Array.isArray(detail.merge_view.files));
  assert.ok(Array.isArray(detail.candidates));
  assert.ok(Array.isArray(detail.sessions));
});

test('buildTerminalLoginLaunch always exposes a human command', () => {
  const launch = buildTerminalLoginLaunch({ projectRoot, provider: 'codex' });

  assert.match(launch.human_command, /node src\/cli\.mjs login/);
  assert.match(launch.human_command, /codex/);
  assert.equal(typeof launch.supported, 'boolean');
});

test('web UI avoids blocking browser modal APIs for provider and run actions', async () => {
  const appSource = await fs.readFile(path.join(projectRoot, 'ui', 'app.js'), 'utf8');

  assert.doesNotMatch(appSource, /window\.alert\s*\(/);
  assert.doesNotMatch(appSource, /window\.confirm\s*\(/);
  assert.doesNotMatch(appSource, /window\.prompt\s*\(/);
});
