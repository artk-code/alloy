import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerminalLoginLaunch } from '../src/auth-launch.mjs';
import { getTaskDetail, listTaskCards, listTaskCatalog } from '../src/web/data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('listTaskCards prioritizes the tic-tac-toe demo card for the first board view', async () => {
  const cards = await listTaskCards(projectRoot);

  assert.ok(cards.length >= 3);
  assert.equal(cards[0].task_id, 'task_20260308_tic_tac_toe_perfect_play');
  assert.equal(cards[0].project_id, 'game-lab');
  assert.equal(cards[0].project_label, 'Game Lab');
  assert.equal(cards[0].source_system, 'imported');
  assert.equal(cards[0].source_label, 'Imported task demo_card_tic_tac_toe_perfect_play');
  assert.equal(cards[0].source_task_id, 'demo_card_tic_tac_toe_perfect_play');
  assert.equal(cards[0].queue_status, 'queued');
  assert.notEqual(cards[0].state, 'PR Ready');
  assert.match(cards[0].title, /perfect play/i);
  assert.match(cards[0].acceptance_summary, /check/i);
  assert.equal(typeof cards[0].card_summary, 'string');
});

test('listTaskCards marks replay-backed historical runs honestly', async () => {
  const cards = await listTaskCards(projectRoot);
  const cacheCard = cards.find((card) => card.task_id === 'task_20260308_cache_invalidation');

  assert.ok(cacheCard);
  assert.equal(cacheCard.run_origin, 'fixture_replay');
  assert.equal(cacheCard.run_origin_label, 'Fixture Replay');
  assert.equal(cacheCard.replay_backed, true);
  assert.match(cacheCard.card_summary, /fixture replay/i);
  assert.notEqual(cacheCard.state, 'Verified Run');
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
  assert.equal(detail.task_brief.source_label, 'Imported task demo_card_tic_tac_toe_perfect_play');
  assert.match(detail.latest_run_overview.execution_summary, /candidate/i);
  assert.equal(detail.latest_run_overview.merge_mode, detail.run_config.merge_mode);
  assert.notEqual(detail.latest_run_overview.status_label, 'PR Ready');
  assert.equal(detail.latest_run_overview.run_origin, 'preview');
  assert.match(detail.latest_run_overview.run_origin_label, /Prepared Workspace|Command Preview/);
  assert.equal(detail.comparison_view.decision.mode, 'pending');
  assert.equal(detail.judge_rationale, null);
  assert.match(detail.compare_url, /review\.html\?task=/);
  assert.ok(Array.isArray(detail.comparison_view.rows));
  assert.equal(detail.comparison_view.judge_rationale, null);
  assert.ok(Array.isArray(detail.merge_view.files));
  assert.equal(detail.merge_view.judge_rationale, null);
  assert.ok(Object.hasOwn(detail, 'publication_view'));
  assert.ok(Object.hasOwn(detail.merge_view, 'publication'));
  if (detail.merge_view.files[0]) {
    assert.equal(typeof detail.merge_view.files[0].contested, 'boolean');
    assert.equal(typeof detail.merge_view.files[0].selection_reasons, 'object');
  }
  assert.ok(Array.isArray(detail.candidates));
  assert.ok(Array.isArray(detail.sessions));
});

test('listTaskCatalog includes queued and non-queue metadata for task setup', async () => {
  const catalog = await listTaskCatalog(projectRoot);
  const ticTacToe = catalog.find((task) => task.task_id === 'task_20260308_tic_tac_toe_perfect_play');

  assert.ok(ticTacToe);
  assert.equal(ticTacToe.queued, true);
  assert.equal(ticTacToe.queue_status, 'queued');
  assert.match(ticTacToe.markdown_path, /tic-tac-toe-perfect-play\.task\.md$/);
});

test('buildTerminalLoginLaunch always exposes a human command', () => {
  const launch = buildTerminalLoginLaunch({ projectRoot, provider: 'codex' });

  assert.match(launch.human_command, /node src\/cli\.mjs login/);
  assert.match(launch.human_command, /codex/);
  assert.equal(typeof launch.supported, 'boolean');
});

test('web UI avoids blocking browser modal APIs for provider and run actions', async () => {
  const appSource = await fs.readFile(path.join(projectRoot, 'ui', 'app.js'), 'utf8');
  const operatorSource = await fs.readFile(path.join(projectRoot, 'ui', 'operator.js'), 'utf8');
  const compareSource = await fs.readFile(path.join(projectRoot, 'ui', 'compare.js'), 'utf8');
  const docsSource = await fs.readFile(path.join(projectRoot, 'ui', 'docs.js'), 'utf8');
  const themeSource = await fs.readFile(path.join(projectRoot, 'ui', 'theme.mjs'), 'utf8');
  const indexHtml = await fs.readFile(path.join(projectRoot, 'ui', 'index.html'), 'utf8');
  const operatorHtml = await fs.readFile(path.join(projectRoot, 'ui', 'operator.html'), 'utf8');
  const tasksHtml = await fs.readFile(path.join(projectRoot, 'ui', 'tasks.html'), 'utf8');
  const compareHtml = await fs.readFile(path.join(projectRoot, 'ui', 'compare.html'), 'utf8');
  const reviewHtml = await fs.readFile(path.join(projectRoot, 'ui', 'review.html'), 'utf8');
  const docsHtml = await fs.readFile(path.join(projectRoot, 'ui', 'docs.html'), 'utf8');
  const taskComposerSource = await fs.readFile(path.join(projectRoot, 'ui', 'task-composer.mjs'), 'utf8');

  assert.doesNotMatch(appSource, /window\.alert\s*\(/);
  assert.doesNotMatch(appSource, /window\.confirm\s*\(/);
  assert.doesNotMatch(appSource, /window\.prompt\s*\(/);
  assert.match(appSource, /initThemeToggle/);
  assert.match(appSource, /Blind Review CLI/);
  assert.doesNotMatch(appSource, /judgeInput\.disabled\s*=\s*true/);
  assert.match(operatorSource, /\/api\/tasks\/create/);
  assert.match(operatorSource, /\/api\/tasks\/catalog/);
  assert.match(operatorSource, /queue\/enqueue/);
  assert.match(operatorSource, /queue\/dequeue/);
  assert.match(operatorSource, /\/api\/tasks\/import-preview/);
  assert.match(operatorSource, /buildReviewUrl/);
  assert.match(operatorSource, /buildDocsUrl/);
  assert.match(operatorSource, /Load Demo Into Setup/);
  assert.match(taskComposerSource, /greenfield_init/);
  assert.match(taskComposerSource, /project bootstrap command/i);
  assert.match(compareSource, /publication\/preview/);
  assert.match(compareSource, /publication\/approve/);
  assert.match(compareSource, /publication\/push/);
  assert.match(compareSource, /blind-review\/run/);
  assert.match(compareSource, /buildOperatorUrl/);
  assert.match(compareSource, /initThemeToggle/);
  assert.match(docsSource, /docs-operator-link/);
  assert.match(docsSource, /initThemeToggle/);
  assert.match(themeSource, /alloy-theme/);
  assert.match(indexHtml, /hero-open-operator/);
  assert.match(indexHtml, />Queue</);
  assert.match(indexHtml, /hero-open-docs/);
  assert.match(indexHtml, /theme-toggle/);
  assert.match(indexHtml, /alloy-theme/);
  assert.match(operatorHtml, /tasks\.html/);
  assert.match(tasksHtml, /task-markdown-preview-tab/);
  assert.match(tasksHtml, /create-task-file/);
  assert.match(tasksHtml, /create-task-file-source/);
  assert.match(tasksHtml, /Task Catalog/);
  assert.match(tasksHtml, /composer-template/);
  assert.match(tasksHtml, /composer-demo-task/);
  assert.match(tasksHtml, /composer-load-demo/);
  assert.match(tasksHtml, /operator-open-compare/);
  assert.match(compareHtml, /review\.html/);
  assert.match(reviewHtml, /compare-docs-link/);
  assert.match(reviewHtml, /compare-operator-link/);
  assert.match(reviewHtml, /theme-toggle/);
  assert.match(reviewHtml, /alloy-theme/);
  assert.match(docsHtml, /docs-content/);
  assert.match(docsHtml, /docs-operator-link/);
  assert.match(docsHtml, /\/tasks\.html/);
  assert.match(docsHtml, /\/review\.html/);
  assert.match(docsHtml, /theme-toggle/);
  assert.match(docsHtml, /alloy-theme/);
});
