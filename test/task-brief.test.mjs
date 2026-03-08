import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTaskBriefFile } from '../src/parser.mjs';
import { buildPromptPackets } from '../src/prompt-packets.mjs';
import { materializeRunArtifacts } from '../src/artifacts.mjs';
import { doctorProviders, getProviderLoginCommand } from '../src/providers.mjs';
import { runPreparedCandidates } from '../src/runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sampleTaskPath = path.join(projectRoot, 'samples/tasks/cache-invalidation.task.md');
const mockProviderScript = path.join(projectRoot, 'fixtures/mock-provider.mjs');

test('parseTaskBriefFile normalizes the sample task', async () => {
  const parsed = await parseTaskBriefFile(sampleTaskPath);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.task.task_id, 'task_20260308_cache_invalidation');
  assert.equal(parsed.task.source_system, 'symphony');
  assert.equal(parsed.task.source_task_id, 'demo_card_cache_invalidation');
  assert.deepEqual(parsed.task.providers, ['codex', 'gemini', 'claude-code']);
  assert.equal(parsed.task.judge, 'claude-code');
  assert.equal(parsed.task.acceptance_checks.length, 3);
  assert.equal(parsed.warnings.length, 0);
});

test('buildPromptPackets creates one packet per provider with deterministic slots', async () => {
  const parsed = await parseTaskBriefFile(sampleTaskPath);
  const packets = buildPromptPackets(parsed.task);

  assert.equal(packets.length, 3);
  assert.deepEqual(
    packets.map((packet) => [packet.provider, packet.candidateSlot]),
    [['codex', 'A'], ['gemini', 'B'], ['claude-code', 'C']]
  );
  assert.match(packets[0].markdown, /# Alloy Candidate Task Packet/);
  assert.match(packets[0].markdown, /## Working Rules/);
});

test('materializeRunArtifacts writes normalized run output', async () => {
  const parsed = await parseTaskBriefFile(sampleTaskPath);
  const packets = buildPromptPackets(parsed.task);
  const result = await materializeRunArtifacts({ projectRoot, parsed, packets });

  const taskJsonPath = path.join(result.runDir, 'task', 'task.json');
  const manifestPath = path.join(result.runDir, 'candidates', 'codex', 'manifest.json');

  const taskJson = JSON.parse(await fs.readFile(taskJsonPath, 'utf8'));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  assert.equal(taskJson.task_id, parsed.task.task_id);
  assert.equal(manifest.provider, 'codex');
  assert.equal(manifest.status, 'planned');
  assert.ok(manifest.workspace_path.endsWith(path.join('candidates', 'codex', 'workspace')));

  await fs.rm(result.runDir, { recursive: true, force: true });
});

test('provider doctor output exposes login metadata for GUI repair flows', async () => {
  const mockSpecs = {
    codex: {
      provider: 'codex',
      displayName: 'Codex',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/mock-provider',
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

  const report = await doctorProviders({ specs: mockSpecs });
  const login = getProviderLoginCommand('codex', mockSpecs);

  assert.equal(report.providers[0].installed, true);
  assert.equal(report.providers[0].auth_status, 'unknown');
  assert.deepEqual(report.providers[0].login_command, ['codex']);
  assert.equal(login.flow, 'interactive-browser');
  assert.match(login.instructions[0], /browser sign-in/i);
});

test('runPreparedCandidates captures live events and updates manifests', async () => {
  const parsed = await parseTaskBriefFile(sampleTaskPath);
  const packets = buildPromptPackets(parsed.task);
  const prepared = await materializeRunArtifacts({ projectRoot, parsed, packets });

  const mockSpecs = Object.fromEntries(
    parsed.task.providers.map((provider) => [provider, {
      provider,
      displayName: provider,
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/mock-provider',
      buildArgs({ prompt }) {
        return [mockProviderScript, provider, prompt];
      }
    }])
  );

  const result = await runPreparedCandidates({
    runDir: prepared.runDir,
    task: parsed.task,
    packets,
    manifests: prepared.manifests,
    specs: mockSpecs
  });

  const codexManifestPath = path.join(prepared.runDir, 'candidates', 'codex', 'manifest.json');
  const codexManifest = JSON.parse(await fs.readFile(codexManifestPath, 'utf8'));
  const runEvents = await fs.readFile(result.runEventsPath, 'utf8');

  assert.equal(result.summary.status, 'completed');
  assert.equal(codexManifest.status, 'completed');
  assert.equal(typeof codexManifest.command.binary, 'string');
  assert.match(runEvents, /candidate.started/);
  assert.match(runEvents, /candidate.completed/);
  assert.match(runEvents, /session.completed/);

  await fs.rm(prepared.runDir, { recursive: true, force: true });
});
