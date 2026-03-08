import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateRun } from '../src/evaluation.mjs';
import { validateMergePlan } from '../src/merge-plan.mjs';

function buildManifest({
  candidateId,
  candidateSlot,
  provider = 'codex',
  providerInstanceId = 'codex-1',
  changedFiles,
  verification = 'pass',
  status = 'completed',
  exitCode = 0,
  totalChangedLines = 12,
  summary = 'candidate summary'
}) {
  return {
    candidate_id: candidateId,
    candidate_slot: candidateSlot,
    provider,
    provider_instance_id: providerInstanceId,
    changed_files: changedFiles,
    verification: { status: verification },
    status,
    exit_code: exitCode,
    error: null,
    summary,
    jj: {
      patch_stats: {
        file_count: changedFiles.length,
        added_lines: totalChangedLines,
        removed_lines: 0,
        total_changed_lines: totalChangedLines
      }
    }
  };
}

const task = {
  task_id: 'task_merge_plan_demo',
  blocked_paths: [],
  allowed_paths: []
};

test('evaluateRun emits a winner-only merge plan for a clear deterministic winner', async () => {
  const result = await evaluateRun({
    task,
    manifests: [
      buildManifest({
        candidateId: 'cand_a',
        candidateSlot: 'A',
        changedFiles: ['src/app.js', 'test/app.test.js'],
        totalChangedLines: 10
      }),
      buildManifest({
        candidateId: 'cand_b',
        candidateSlot: 'B',
        changedFiles: ['src/app.js'],
        verification: 'fail',
        totalChangedLines: 80
      })
    ]
  });

  assert.equal(result.decision.mode, 'winner');
  assert.equal(result.merge_plan.mode, 'winner_only');
  assert.equal(result.merge_plan.base_candidate_id, 'cand_a');
  assert.equal(result.merge_plan.file_decisions.length, 2);
  assert.equal(result.merge_plan.unresolved_conflicts.length, 0);
  assert.equal(result.judge_rationale.mode, 'winner');
  assert.equal(result.judge_rationale.base_candidate_id, 'cand_a');
  assert.equal(result.judge_rationale.file_rationale.length, 2);
  assert.match(result.judge_rationale.overview, /deterministic leader/i);
  assert.match(result.judge_rationale.next_action, /finalize/i);

  const validation = validateMergePlan({
    mergePlan: result.merge_plan,
    candidates: result.candidates
  });
  assert.equal(validation.ok, true);
});

test('evaluateRun emits manual-review merge plan data for a contested close finish', async () => {
  const result = await evaluateRun({
    task,
    manifests: [
      buildManifest({
        candidateId: 'cand_a',
        candidateSlot: 'A',
        changedFiles: ['src/app.js'],
        totalChangedLines: 20
      }),
      buildManifest({
        candidateId: 'cand_b',
        candidateSlot: 'B',
        changedFiles: ['src/app.js'],
        totalChangedLines: 20,
        providerInstanceId: 'gemini-1',
        provider: 'gemini'
      })
    ]
  });

  assert.equal(result.decision.mode, 'synthesize');
  assert.equal(result.merge_plan.mode, 'manual_review');
  assert.equal(result.merge_plan.file_decisions.length, 1);
  assert.equal(result.merge_plan.unresolved_conflicts.length, 1);
  assert.equal(result.merge_plan.file_decisions[0].path, 'src/app.js');
  assert.equal(result.merge_plan.file_decisions[0].confidence, 'low');
  assert.equal(result.judge_rationale.mode, 'synthesize');
  assert.equal(result.judge_rationale.unresolved_conflicts.length, 1);
  assert.equal(result.judge_rationale.file_rationale[0].contested, true);
  assert.match(result.judge_rationale.overview, /contested file/i);

  const validation = validateMergePlan({
    mergePlan: result.merge_plan,
    candidates: result.candidates
  });
  assert.equal(validation.ok, true);
});
