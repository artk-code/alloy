import fs from 'node:fs/promises';
import path from 'node:path';

import { buildProviderCommand, buildProviderEnv, DEFAULT_PROVIDER_SPECS } from './providers.mjs';
import { SessionManager } from './session-manager.mjs';

export async function runBlindReviewAgent({
  runDir,
  task,
  provider = task.judge,
  profileId = 'default',
  transport = 'pipe',
  specs = DEFAULT_PROVIDER_SPECS,
  sessionManager = null,
  maxTurns = 12
}) {
  const summaryPath = path.join(runDir, 'run-summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const blindReviewPath = summary.blind_review_path || path.join(runDir, 'blind-judge-packet.json');
  const composerPlanPath = summary.composer_plan_path || path.join(runDir, 'composer-plan.json');
  const blindReview = JSON.parse(await fs.readFile(blindReviewPath, 'utf8'));
  const composerPlan = JSON.parse(await fs.readFile(composerPlanPath, 'utf8'));

  const reviewDir = path.join(runDir, 'blind-review');
  await fs.mkdir(reviewDir, { recursive: true });
  const localBlindReviewPath = path.join(reviewDir, 'blind-judge-packet.json');
  const localComposerPlanPath = path.join(reviewDir, 'composer-plan.json');
  await fs.writeFile(localBlindReviewPath, JSON.stringify(blindReview, null, 2) + '\n', 'utf8');
  await fs.writeFile(localComposerPlanPath, JSON.stringify(composerPlan, null, 2) + '\n', 'utf8');

  const recommendationPath = path.join(reviewDir, `${provider}-recommendation.json`);
  const notesPath = path.join(reviewDir, `${provider}-recommendation.md`);
  const promptPath = path.join(reviewDir, `${provider}-prompt.md`);
  const prompt = buildBlindReviewPrompt({
    task,
    blindReview,
    composerPlan,
    recommendationPath,
    notesPath
  });
  await fs.writeFile(promptPath, prompt, 'utf8');

  const manager = sessionManager || new SessionManager({
    projectRoot: path.resolve(runDir, '..', '..')
  });
  const command = buildProviderCommand({
    provider,
    prompt,
    options: { maxTurns },
    specs
  });
  const session = await manager.runCommandSession({
    kind: 'blind-review',
    provider,
    profileId,
    transport,
    runDir,
    projectId: task.project_id,
    taskId: task.task_id,
    command,
    cwd: reviewDir,
    env: buildProviderEnv(process.env),
    metadata: {
      blind_review_path: blindReviewPath,
      composer_plan_path: composerPlanPath,
      blind_review_local_path: localBlindReviewPath,
      composer_plan_local_path: localComposerPlanPath,
      recommendation_path: recommendationPath,
      notes_path: notesPath
    }
  });

  const recommendation = await readRecommendation(recommendationPath);
  const record = {
    provider,
    profile_id: profileId,
    transport,
    prompt_path: promptPath,
    blind_review_path: blindReviewPath,
    composer_plan_path: composerPlanPath,
    recommendation_path: recommendationPath,
    notes_path: notesPath,
    session_record_path: session.paths.record_path,
    started_at: session.started_at,
    completed_at: session.completed_at,
    status: recommendation ? 'completed' : 'failed',
    recommendation,
    error: recommendation ? null : 'blind_review_recommendation_missing_or_invalid'
  };

  summary.agent_blind_reviews = {
    ...(summary.agent_blind_reviews || {}),
    [provider]: record
  };
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  return record;
}

export function buildBlindReviewPrompt({
  task,
  blindReview,
  composerPlan,
  recommendationPath,
  notesPath
}) {
  return [
    '# Blind Review Task',
    '',
    'Read the blind review packet and composer plan from the current working directory context.',
    'Do not modify any repository code or task files.',
    'Your job is to review the candidates blindly and write a structured recommendation for a human operator.',
    '',
    'Files provided:',
    `- Blind review packet: ${blindReview.task_id ? 'blind-judge-packet.json' : 'unknown'}`,
    '- Composer plan: composer-plan.json',
    '',
    'Required outputs:',
    `1. Write valid JSON to: ${path.basename(recommendationPath)}`,
    `2. Optionally write a short markdown note to: ${path.basename(notesPath)}`,
    '',
    'The JSON must have this shape:',
    '```json',
    JSON.stringify({
      recommended_mode: 'winner_finalize',
      recommended_base_blind_id: 'candidate_a',
      confidence: 'high',
      summary: 'Candidate A is the safest deterministic winner.',
      reasons: ['Verification passed and no contested files remain.'],
      file_overrides: [],
      human_approval_required: true
    }, null, 2),
    '```',
    '',
    'Rules:',
    '- Use blind labels only, never provider names.',
    '- If the current composer plan is already sound, keep it and explain why.',
    '- If you recommend file-level composition, each file override must use blind labels only.',
    '- If the evidence is weak, set confidence to low and keep human_approval_required true.',
    '',
    'Task context:',
    `- Title: ${task.title || task.task_id}`,
    `- Objective: ${task.context || task.title || task.task_id}`,
    `- Acceptance checks: ${(task.acceptance_checks || []).join(' | ') || 'none'}`,
    '',
    'Blind review packet:',
    '```json',
    JSON.stringify(blindReview, null, 2),
    '```',
    '',
    'Composer plan:',
    '```json',
    JSON.stringify(composerPlan, null, 2),
    '```'
  ].join('\n');
}

async function readRecommendation(recommendationPath) {
  try {
    return JSON.parse(await fs.readFile(recommendationPath, 'utf8'));
  } catch {
    return null;
  }
}
