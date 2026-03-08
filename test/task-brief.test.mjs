import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseTaskBriefFile } from '../src/parser.mjs';
import { buildPromptPackets } from '../src/prompt-packets.mjs';
import { materializeRunArtifacts } from '../src/artifacts.mjs';
import { doctorProviders, getProviderLoginCommand } from '../src/providers.mjs';
import { buildDefaultRunConfig, normalizeRunConfig } from '../src/run-config.mjs';
import { runPreparedCandidates } from '../src/runner.mjs';
import { SessionManager } from '../src/session-manager.mjs';
import { approvePublication, pushPublication, refreshPublicationState, synthesizeRun } from '../src/synthesis.mjs';
import { runAcceptanceChecks } from '../src/verify.mjs';
import { getSynthesisDiff, getTaskDetail, getTaskPublication } from '../src/web/data.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const ticTacToeTaskPath = path.join(projectRoot, 'samples/tasks/tic-tac-toe-perfect-play.task.md');
const ticTacToeRepoPath = path.join(projectRoot, 'samples/repos/tic-tac-toe');
const securityTaskPath = path.join(projectRoot, 'samples/tasks/security-sql-injection.task.md');
const securityRepoPath = path.join(projectRoot, 'samples/repos/security-sqli');
const replayFileScript = path.join(projectRoot, 'fixtures/replay-file.mjs');
const ticTacToePerfectStrategyPath = path.join(projectRoot, 'fixtures/tic-tac-toe/strategy.perfect.js');

test('parseTaskBriefFile normalizes the primary tic-tac-toe demo task', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.task.task_id, 'task_20260308_tic_tac_toe_perfect_play');
  assert.equal(parsed.task.project_id, 'game-lab');
  assert.equal(parsed.task.project_label, 'Game Lab');
  assert.equal(parsed.task.source_system, 'symphony');
  assert.equal(parsed.task.source_task_id, 'demo_card_tic_tac_toe_perfect_play');
  assert.equal(parsed.task.demo_priority, 100);
  assert.deepEqual(parsed.task.providers, ['codex', 'gemini', 'claude-code']);
  assert.equal(parsed.task.judge, 'claude-code');
  assert.deepEqual(parsed.task.acceptance_checks, ['npm test', 'node scripts/eval-perfect-play.mjs']);
  assert.equal(parsed.warnings.length, 0);
});

test('buildDefaultRunConfig includes the conservative merge mode default', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = buildDefaultRunConfig(parsed.task);

  assert.equal(runConfig.merge_mode, 'hybrid');
  assert.equal(runConfig.providers.length, 3);
});

test('normalizeRunConfig allows deterministic-only blind review mode', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = normalizeRunConfig(parsed.task, {
    ...buildDefaultRunConfig(parsed.task),
    judge: 'none'
  });

  assert.equal(runConfig.judge, 'none');
});

test('buildPromptPackets expands run config into deterministic candidate slots', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = normalizeRunConfig(parsed.task, {
    mode: 'race',
    judge: 'claude-code',
    merge_mode: 'manual',
    providers: [
      { provider: 'codex', enabled: true, agents: 2, profile_id: 'default', transport: 'pipe' },
      { provider: 'gemini', enabled: false, agents: 0, profile_id: 'default', transport: 'pipe' },
      { provider: 'claude-code', enabled: true, agents: 1, profile_id: 'default', transport: 'pipe' }
    ]
  });
  const packets = buildPromptPackets(parsed.task, { runConfig });

  assert.equal(packets.length, 3);
  assert.deepEqual(
    packets.map((packet) => [packet.providerInstanceId, packet.candidateSlot]),
    [['codex-1', 'A'], ['codex-2', 'B'], ['claude-code-1', 'C']]
  );
  assert.equal(packets[0].packet.project_id, 'game-lab');
  assert.match(packets[0].markdown, /Provider Instance: codex-1/);
  assert.match(packets[0].markdown, /Project: Game Lab \(game-lab\)/);
  assert.match(packets[1].markdown, /Agent Index: 2/);
});

test('materializeRunArtifacts writes unique manifests for repeated providers', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = normalizeRunConfig(parsed.task, {
    ...buildDefaultRunConfig(parsed.task),
    providers: [
      { provider: 'codex', enabled: true, agents: 2, profile_id: 'default', transport: 'pipe' },
      { provider: 'gemini', enabled: false, agents: 0, profile_id: 'default', transport: 'pipe' },
      { provider: 'claude-code', enabled: true, agents: 1, profile_id: 'default', transport: 'pipe' }
    ]
  });
  const packets = buildPromptPackets(parsed.task, { runConfig });
  const result = await materializeRunArtifacts({ projectRoot, parsed: { ...parsed, task: { ...parsed.task, run_config: runConfig } }, packets, runConfig });

  const taskJsonPath = path.join(result.runDir, 'task', 'task.json');
  const manifestPath = path.join(result.runDir, 'candidates', 'a-codex-1', 'manifest.json');

  const taskJson = JSON.parse(await fs.readFile(taskJsonPath, 'utf8'));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  assert.equal(taskJson.task_id, parsed.task.task_id);
  assert.equal(taskJson.run_config.providers[0].agents, 2);
  assert.equal(manifest.provider, 'codex');
  assert.equal(manifest.provider_instance_id, 'codex-1');
  assert.equal(manifest.transport, 'pipe');
  assert.ok(manifest.workspace_path.endsWith(path.join('candidates', 'a-codex-1', 'workspace')));

  await fs.rm(result.runDir, { recursive: true, force: true });
});

test('provider doctor output exposes login and transport metadata for GUI repair flows', async () => {
  const testSpecs = {
    codex: {
      provider: 'codex',
      displayName: 'Codex',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/test-provider',
      runtime: {
        loginTransport: 'pty',
        runTransport: 'pipe',
        supportedRunTransports: ['pipe', 'pty'],
        supportsJsonStream: true,
        supportsNonInteractive: true,
        authObservable: false,
        profiles: [{ id: 'default', label: 'Default' }]
      },
      auth: {
        status: 'unknown',
        flow: 'interactive-browser',
        loginCommand: ['codex'],
        instructions: ['Open Codex and complete browser sign-in.']
      },
      buildArgs() {
        return [];
      }
    }
  };

  const report = await doctorProviders({ specs: testSpecs });
  const login = getProviderLoginCommand('codex', testSpecs);

  assert.equal(report.providers[0].installed, true);
  assert.equal(report.providers[0].auth_status, 'unknown');
  assert.equal(report.providers[0].default_transport, 'pipe');
  assert.deepEqual(report.providers[0].supported_run_transports, ['pipe', 'pty']);
  assert.deepEqual(report.providers[0].login_command, ['codex']);
  assert.equal(login.flow, 'interactive-browser');
  assert.match(login.instructions[0], /browser sign-in/i);
});

test('runPreparedCandidates replays a real fixture change and validates it with real tic-tac-toe checks', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = normalizeRunConfig(parsed.task, {
    mode: 'race',
    judge: 'claude-code',
    merge_mode: 'manual',
    providers: [
      { provider: 'codex', enabled: true, agents: 1, profile_id: 'default', transport: 'pipe' },
      { provider: 'gemini', enabled: false, agents: 0, profile_id: 'default', transport: 'pipe' },
      { provider: 'claude-code', enabled: false, agents: 0, profile_id: 'default', transport: 'pipe' }
    ]
  });
  const task = { ...parsed.task, run_config: runConfig };
  const packets = buildPromptPackets(task, { runConfig });
  const prepared = await materializeRunArtifacts({ projectRoot, parsed: { ...parsed, task }, packets, runConfig });
  const sessionManager = new SessionManager({
    projectRoot,
    stateDir: path.join(prepared.runDir, 'session-state')
  });

  const testSpecs = {
    codex: {
      provider: 'codex',
      displayName: 'Codex',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/test-provider',
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
        return [
          replayFileScript,
          'codex',
          ticTacToePerfectStrategyPath,
          'src/strategy.js',
          `codex replay complete (${prompt.length} chars of prompt input)`
        ];
      }
    }
  };

  const result = await runPreparedCandidates({
    runDir: prepared.runDir,
    task,
    packets,
    manifests: prepared.manifests,
    specs: testSpecs,
    sessionManager
  });

  const manifestPath = path.join(prepared.runDir, 'candidates', 'a-codex-1', 'manifest.json');
  const strategyPath = path.join(prepared.runDir, 'candidates', 'a-codex-1', 'workspace', 'src', 'strategy.js');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const strategy = await fs.readFile(strategyPath, 'utf8');
  const sessionRecord = JSON.parse(await fs.readFile(manifest.session_record_path, 'utf8'));
  const runEvents = await fs.readFile(result.runEventsPath, 'utf8');
  const evalStdoutPath = manifest.verification.checks[1].stdout_path;
  const evalStdout = await fs.readFile(evalStdoutPath, 'utf8');
  const patch = await fs.readFile(manifest.artifact_paths.patch_path, 'utf8');
  const diffSummary = await fs.readFile(manifest.artifact_paths.diff_summary_path, 'utf8');
  const scorecard = JSON.parse(await fs.readFile(manifest.artifact_paths.evaluation_path, 'utf8'));
  const judgeRationale = JSON.parse(await fs.readFile(path.join(prepared.runDir, 'judge-rationale.json'), 'utf8'));

  assert.equal(result.summary.status, 'completed');
  assert.equal(manifest.status, 'completed');
  assert.equal(manifest.verification.status, 'pass');
  assert.equal(sessionRecord.status, 'completed');
  assert.equal(sessionRecord.transport, 'pipe');
  assert.equal(manifest.jj.status, 'captured');
  assert.equal(manifest.jj.patch_stats.file_count, 1);
  assert.equal(manifest.changed_files[0], 'src/strategy.js');
  assert.match(strategy, /scorePosition/);
  assert.match(patch, /diff --git a\/src\/strategy\.js b\/src\/strategy\.js/);
  assert.match(diffSummary, /M src\/strategy\.js/);
  assert.equal(scorecard.eligible, true);
  assert.ok(scorecard.scorecard.total >= 90);
  assert.equal(result.summary.evaluation.decision.mode, 'winner');
  assert.equal(result.summary.evaluation.decision.winner_candidate_id, manifest.candidate_id);
  assert.equal(result.summary.judge_rationale_path, path.join(prepared.runDir, 'judge-rationale.json'));
  assert.equal(judgeRationale.mode, 'winner');
  assert.equal(judgeRationale.winner_candidate_id, manifest.candidate_id);
  assert.ok(Array.isArray(judgeRationale.operator_guidance));
  assert.equal(result.summary.synthesis, null);
  assert.match(evalStdout, /Perfect-play eval passed on/);
  assert.match(runEvents, /session.started/);
  assert.match(runEvents, /candidate.stream/);
  assert.match(runEvents, /verification.completed/);
  assert.match(runEvents, /jj\.capture\.completed/);
  assert.match(runEvents, /evaluation\.completed/);

  await fs.rm(prepared.runDir, { recursive: true, force: true });
});

test('synthesizeRun creates verified winner-only and file-select workspaces from captured candidate diffs', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = normalizeRunConfig(parsed.task, {
    mode: 'race',
    judge: 'claude-code',
    merge_mode: 'manual',
    providers: [
      { provider: 'codex', enabled: true, agents: 1, profile_id: 'default', transport: 'pipe' },
      { provider: 'gemini', enabled: false, agents: 0, profile_id: 'default', transport: 'pipe' },
      { provider: 'claude-code', enabled: false, agents: 0, profile_id: 'default', transport: 'pipe' }
    ]
  });
  const task = { ...parsed.task, run_config: runConfig };
  const packets = buildPromptPackets(task, { runConfig });
  const prepared = await materializeRunArtifacts({ projectRoot, parsed: { ...parsed, task }, packets, runConfig });
  const sessionManager = new SessionManager({
    projectRoot,
    stateDir: path.join(prepared.runDir, 'session-state')
  });

  const testSpecs = {
    codex: {
      provider: 'codex',
      displayName: 'Codex',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/test-provider',
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
        return [
          replayFileScript,
          'codex',
          ticTacToePerfectStrategyPath,
          'src/strategy.js',
          `codex replay complete (${prompt.length} chars of prompt input)`
        ];
      }
    }
  };

  await runPreparedCandidates({
    runDir: prepared.runDir,
    task,
    packets,
    manifests: prepared.manifests,
    specs: testSpecs,
    sessionManager
  });

  const winnerManifest = JSON.parse(await fs.readFile(path.join(prepared.runDir, 'candidates', 'a-codex-1', 'manifest.json'), 'utf8'));
  const evaluation = JSON.parse(await fs.readFile(path.join(prepared.runDir, 'evaluation.json'), 'utf8'));

  const winnerOnly = await synthesizeRun({
    runDir: prepared.runDir,
    task,
    mergePlan: evaluation.merge_plan,
    selectedBy: 'test-suite'
  });
  const fileSelect = await synthesizeRun({
    runDir: prepared.runDir,
    task,
    strategy: 'file_select',
    fileSelections: {
      'src/strategy.js': winnerManifest.candidate_id
    },
    selectedBy: 'test-suite'
  });

  const winnerPatch = await fs.readFile(winnerOnly.artifact_paths.patch_path, 'utf8');
  const fileSelectPatch = await fs.readFile(fileSelect.artifact_paths.patch_path, 'utf8');

  assert.equal(winnerOnly.status, 'completed');
  assert.equal(winnerOnly.verification.status, 'pass');
  assert.equal(winnerOnly.selected_files[0].path, 'src/strategy.js');
  assert.equal(winnerOnly.selected_files[0].selection_origin, 'winner_only');
  assert.equal(winnerOnly.merge_plan.base_candidate_id, winnerManifest.candidate_id);
  assert.equal(winnerOnly.publication_readiness.ready, true);
  assert.equal(winnerOnly.publication.status, 'awaiting_approval');
  assert.equal(winnerOnly.publication.eligible_for_approval, true);
  assert.match(winnerOnly.publication.target_branch_or_bookmark, /alloy\/task-20260308-tic-tac-toe-perfect-play\//);
  assert.equal(winnerOnly.stack_shape.status, 'not_needed');
  assert.match(winnerPatch, /diff --git a\/src\/strategy\.js b\/src\/strategy\.js/);

  assert.equal(fileSelect.status, 'completed');
  assert.equal(fileSelect.verification.status, 'pass');
  assert.equal(fileSelect.selected_files[0].candidate_id, winnerManifest.candidate_id);
  assert.equal(fileSelect.merge_plan.mode, 'file_select');
  assert.equal(fileSelect.selected_files[0].selection_origin, 'merge_plan');
  assert.equal(fileSelect.publication_readiness.status, 'review_ready');
  assert.equal(fileSelect.publication.status, 'awaiting_approval');
  assert.equal(fileSelect.publication.publish_preview.stack_group_count, 1);
  assert.match(fileSelectPatch, /diff --git a\/src\/strategy\.js b\/src\/strategy\.js/);

  const preview = await refreshPublicationState({
    runDir: prepared.runDir,
    task
  });
  const approved = await approvePublication({
    runDir: prepared.runDir,
    task,
    approvedBy: 'test-suite',
    note: 'Publication approved in integration test.'
  });
  const failedPush = await pushPublication({
    runDir: prepared.runDir,
    task
  });
  const publishRemotePath = path.join(prepared.runDir, 'publish-remote.git');
  await execFileAsync('git', ['init', '--bare', publishRemotePath], { cwd: prepared.runDir });
  await execFileAsync('git', ['remote', 'add', 'origin', publishRemotePath], { cwd: fileSelect.workspace_path });
  const pushed = await pushPublication({
    runDir: prepared.runDir,
    task
  });
  const updatedSummary = JSON.parse(await fs.readFile(path.join(prepared.runDir, 'run-summary.json'), 'utf8'));
  const synthesisDiff = await getSynthesisDiff(projectRoot, task.task_id);
  const detail = await getTaskDetail(projectRoot, task.task_id);
  const publicationView = await getTaskPublication(projectRoot, task.task_id);
  const { stdout: remoteRefs } = await execFileAsync('git', ['--git-dir', publishRemotePath, 'show-ref'], {
    cwd: prepared.runDir
  });

  assert.equal(updatedSummary.synthesis.strategy, 'file_select');
  assert.equal(updatedSummary.synthesis.status, 'completed');
  assert.equal(updatedSummary.synthesis.merge_plan.mode, 'file_select');
  assert.equal(updatedSummary.synthesis.publication_readiness.ready, true);
  assert.equal(updatedSummary.synthesis.publication.status, 'pushed');
  assert.ok(synthesisDiff);
  assert.equal(synthesisDiff.strategy, 'file_select');
  assert.equal(synthesisDiff.publication_readiness.ready, true);
  assert.equal(synthesisDiff.publication.status, 'pushed');
  assert.equal(synthesisDiff.selected_files[0].selection_origin, 'merge_plan');
  assert.match(synthesisDiff.patch, /diff --git a\/src\/strategy\.js b\/src\/strategy\.js/);
  assert.equal(preview.status, 'awaiting_approval');
  assert.equal(approved.status, 'push_ready');
  assert.equal(approved.human_approved_by, 'test-suite');
  assert.equal(failedPush.status, 'publish_failed');
  assert.equal(failedPush.push_result.status, 'failed');
  assert.equal(pushed.status, 'pushed');
  assert.equal(pushed.push_result.status, 'success');
  assert.equal(publicationView.status, 'pushed');
  assert.equal(detail.publication_view.status, 'pushed');
  assert.equal(detail.merge_view.publication.status, 'pushed');
  assert.match(detail.publication_view.target_branch_or_bookmark, /alloy\/task-20260308-tic-tac-toe-perfect-play\//);
  assert.match(String(publicationView.published_ref), /^origin\/alloy\//);
  assert.match(remoteRefs, /refs\/heads\/alloy\/task-20260308-tic-tac-toe-perfect-play\//);

  await fs.rm(prepared.runDir, { recursive: true, force: true });
});

test('runAcceptanceChecks executes the real perfect-play evaluator and fails before the demo fix', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-ttt-demo-'));
  const workspacePath = path.join(workspaceRoot, 'workspace');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.cp(ticTacToeRepoPath, workspacePath, { recursive: true });
  const strategySource = await fs.readFile(path.join(workspacePath, 'src', 'strategy.js'), 'utf8');

  const verification = await runAcceptanceChecks({
    workspacePath,
    commands: ['node scripts/eval-perfect-play.mjs'],
    outputDir: workspacePath
  });
  const stdout = await fs.readFile(verification.checks[0].stdout_path, 'utf8');
  const stderr = await fs.readFile(verification.checks[0].stderr_path, 'utf8');

  assert.match(strategySource, /board\[4\] === null/);
  assert.equal(verification.status, 'fail');
  assert.equal(verification.checks[0].status, 'fail');
  assert.match(stderr, /Perfect-play eval failed on/);
  assert.match(stderr, /Expected one of/);
  assert.equal(stdout.trim(), '');

  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

test('parseTaskBriefFile normalizes the security lab task and project metadata', async () => {
  const parsed = await parseTaskBriefFile(securityTaskPath);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.task.task_id, 'task_20260308_security_sql_injection');
  assert.equal(parsed.task.project_id, 'security-lab');
  assert.equal(parsed.task.project_label, 'Security Lab');
  assert.deepEqual(parsed.task.acceptance_checks, ['npm test', 'node scripts/eval-security-fix.mjs']);
});

test('runAcceptanceChecks exposes the broken SQL injection demo baseline', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'alloy-security-demo-'));
  const workspacePath = path.join(workspaceRoot, 'workspace');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.cp(securityRepoPath, workspacePath, { recursive: true });

  const verification = await runAcceptanceChecks({
    workspacePath,
    commands: ['npm test', 'node scripts/eval-security-fix.mjs'],
    outputDir: workspacePath
  });

  const stdout = await fs.readFile(verification.checks[0].stdout_path, 'utf8');
  const stderr = await fs.readFile(verification.checks[0].stderr_path, 'utf8');

  assert.equal(verification.status, 'fail');
  assert.equal(verification.checks[0].status, 'fail');
  assert.match(stdout + stderr, /SQL injection|placeholder params|raw interpolation/i);

  await fs.rm(workspaceRoot, { recursive: true, force: true });
});
