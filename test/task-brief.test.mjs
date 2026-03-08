import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTaskBriefFile } from '../src/parser.mjs';
import { buildPromptPackets } from '../src/prompt-packets.mjs';
import { materializeRunArtifacts } from '../src/artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sampleTaskPath = path.join(projectRoot, 'samples/tasks/cache-invalidation.task.md');

test('parseTaskBriefFile normalizes the sample task', async () => {
  const parsed = await parseTaskBriefFile(sampleTaskPath);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.task.task_id, 'task_20260308_cache_invalidation');
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
