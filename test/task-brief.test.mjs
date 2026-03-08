import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';

import { parseTaskBriefFile } from '../src/parser.mjs';
import { buildPromptPackets } from '../src/prompt-packets.mjs';
import { materializeRunArtifacts } from '../src/artifacts.mjs';
import { doctorProviders, getProviderLoginCommand } from '../src/providers.mjs';
import { buildDefaultRunConfig, normalizeRunConfig } from '../src/run-config.mjs';
import { runPreparedCandidates } from '../src/runner.mjs';
import { SessionManager } from '../src/session-manager.mjs';
import { runAcceptanceChecks } from '../src/verify.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const ticTacToeTaskPath = path.join(projectRoot, 'samples/tasks/tic-tac-toe-perfect-play.task.md');
const ticTacToeRepoPath = path.join(projectRoot, 'samples/repos/tic-tac-toe');
const replayFileScript = path.join(projectRoot, 'fixtures/replay-file.mjs');
const ticTacToePerfectStrategyPath = path.join(projectRoot, 'fixtures/tic-tac-toe/strategy.perfect.js');

test('parseTaskBriefFile normalizes the primary tic-tac-toe demo task', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.task.task_id, 'task_20260308_tic_tac_toe_perfect_play');
  assert.equal(parsed.task.source_system, 'symphony');
  assert.equal(parsed.task.source_task_id, 'demo_card_tic_tac_toe_perfect_play');
  assert.equal(parsed.task.demo_priority, 100);
  assert.deepEqual(parsed.task.providers, ['codex', 'gemini', 'claude-code']);
  assert.equal(parsed.task.judge, 'claude-code');
  assert.deepEqual(parsed.task.acceptance_checks, ['npm test', 'node scripts/eval-perfect-play.mjs']);
  assert.equal(parsed.warnings.length, 0);
});

test('buildPromptPackets expands run config into deterministic candidate slots', async () => {
  const parsed = await parseTaskBriefFile(ticTacToeTaskPath);
  const runConfig = normalizeRunConfig(parsed.task, {
    mode: 'race',
    judge: 'claude-code',
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
  assert.match(packets[0].markdown, /Provider Instance: codex-1/);
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
  assert.match(evalStdout, /Perfect-play eval passed on/);
  assert.match(runEvents, /session.started/);
  assert.match(runEvents, /candidate.stream/);
  assert.match(runEvents, /verification.completed/);
  assert.match(runEvents, /jj\.capture\.completed/);
  assert.match(runEvents, /evaluation\.completed/);

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
