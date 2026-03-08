import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { runBlindReviewAgent } from '../src/blind-review-agent.mjs';
import { SessionManager } from '../src/session-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const blindReviewWriterScript = path.join(projectRoot, 'fixtures', 'blind-review-writer.mjs');

test('runBlindReviewAgent reviews saved artifacts and writes a structured recommendation', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'alloy-blind-review-'));
  const runDir = path.join(tempRoot, 'run');
  await fs.mkdir(runDir, { recursive: true });

  const blindReview = {
    task_id: 'task_blind_review_demo',
    evaluated_at: '2026-03-08T00:00:00.000Z',
    decision: {
      mode: 'winner',
      confidence: 'high',
      winner: {
        blind_id: 'candidate_a',
        label: 'Candidate A'
      }
    },
    guidance: {
      overview: 'Candidate A is already the clearest deterministic winner.'
    }
  };
  const composerPlan = {
    task_id: 'task_blind_review_demo',
    mode: 'winner_finalize',
    confidence: 'high',
    summary: 'Finalize the winning candidate without additional composition.',
    review_required: true,
    file_allocations: [],
    unresolved_conflicts: []
  };

  const blindReviewPath = path.join(runDir, 'blind-judge-packet.json');
  const composerPlanPath = path.join(runDir, 'composer-plan.json');
  const summaryPath = path.join(runDir, 'run-summary.json');

  await fs.writeFile(blindReviewPath, JSON.stringify(blindReview, null, 2) + '\n', 'utf8');
  await fs.writeFile(composerPlanPath, JSON.stringify(composerPlan, null, 2) + '\n', 'utf8');
  await fs.writeFile(summaryPath, JSON.stringify({
    project_id: 'game-lab',
    task_id: 'task_blind_review_demo',
    blind_review_path: blindReviewPath,
    composer_plan_path: composerPlanPath
  }, null, 2) + '\n', 'utf8');

  const sessionManager = new SessionManager({
    projectRoot,
    stateDir: path.join(tempRoot, 'session-state')
  });
  const specs = {
    codex: {
      provider: 'codex',
      displayName: 'Codex',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/blind-review',
      runtime: {
        loginTransport: 'pty',
        runTransport: 'pipe',
        supportedRunTransports: ['pipe', 'pty'],
        supportsJsonStream: true,
        supportsNonInteractive: true,
        authObservable: false,
        profiles: [{ id: 'default', label: 'Default' }]
      },
      buildArgs({ prompt }) {
        return [blindReviewWriterScript, prompt];
      }
    }
  };

  const record = await runBlindReviewAgent({
    runDir,
    task: {
      project_id: 'game-lab',
      task_id: 'task_blind_review_demo',
      title: 'Blind review demo',
      acceptance_checks: ['npm test']
    },
    provider: 'codex',
    profileId: 'default',
    transport: 'pipe',
    specs,
    sessionManager
  });

  const updatedSummary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const recommendation = JSON.parse(await fs.readFile(record.recommendation_path, 'utf8'));
  const note = await fs.readFile(record.notes_path, 'utf8');

  assert.equal(record.status, 'completed');
  assert.equal(record.provider, 'codex');
  assert.equal(recommendation.recommended_mode, 'winner_finalize');
  assert.equal(recommendation.recommended_base_blind_id, 'candidate_a');
  assert.match(note, /Candidate A is recommended/i);
  assert.equal(updatedSummary.agent_blind_reviews.codex.status, 'completed');
  assert.equal(updatedSummary.agent_blind_reviews.codex.recommendation.recommended_mode, 'winner_finalize');

  await fs.rm(tempRoot, { recursive: true, force: true });
});
