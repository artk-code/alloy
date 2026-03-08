import path from 'node:path';

import { materializeRunArtifacts } from './artifacts.mjs';
import { parseTaskBrief, parseTaskBriefFile } from './parser.mjs';
import { buildPromptPackets } from './prompt-packets.mjs';
import { buildDefaultRunConfig, normalizeRunConfig } from './run-config.mjs';
import { runPreparedCandidates } from './runner.mjs';

export async function prepareTaskFromFile({ projectRoot, taskFilePath, runConfig = null }) {
  const absolutePath = path.resolve(taskFilePath);
  const parsed = await parseTaskBriefFile(absolutePath);
  return prepareParsedTask({ projectRoot, parsed, runConfig });
}

export async function prepareTaskFromMarkdown({ projectRoot, markdown, sourcePath = '<web-ui>', runConfig = null }) {
  const parsed = parseTaskBrief(markdown, sourcePath);
  if (parsed.task.repo_path && sourcePath !== '<web-ui>') {
    parsed.task.repo_path = path.resolve(path.dirname(sourcePath), parsed.task.repo_path);
  }
  return prepareParsedTask({ projectRoot, parsed, runConfig });
}

export async function runTaskFromPrepared({ task, packets, prepared, dryRun = false, maxTurns = 24, sessionManager = null }) {
  const runResult = await runPreparedCandidates({
    runDir: prepared.runDir,
    task,
    packets,
    manifests: prepared.manifests,
    sessionManager,
    dryRun,
    maxTurns
  });

  return {
    ...buildPreparedOutput({ task, packets, prepared, warnings: prepared.warnings || [] }),
    run_events_path: runResult.runEventsPath,
    summary: runResult.summary
  };
}

function prepareParsedTask({ projectRoot, parsed, runConfig }) {
  if (!parsed.ok) {
    const error = new Error('Task brief validation failed.');
    error.details = { errors: parsed.errors, warnings: parsed.warnings };
    throw error;
  }

  const normalizedRunConfig = normalizeRunConfig(parsed.task, runConfig || buildDefaultRunConfig(parsed.task));
  const task = {
    ...parsed.task,
    run_config: normalizedRunConfig
  };
  const packets = buildPromptPackets(task, { runConfig: normalizedRunConfig });
  return materializeRunArtifacts({ projectRoot, parsed: { ...parsed, task }, packets, runConfig: normalizedRunConfig })
    .then((prepared) => {
      return {
        parsed,
        task,
        packets,
        runConfig: normalizedRunConfig,
        prepared,
        output: buildPreparedOutput({
          task,
          packets,
          prepared,
          warnings: parsed.warnings,
          runConfig: normalizedRunConfig
        })
      };
    });
}

function buildPreparedOutput({ task, packets, prepared, warnings, runConfig }) {
  return {
    task_id: task.task_id,
    source_system: task.source_system,
    source_task_id: task.source_task_id || null,
    run_dir: prepared.runDir,
    warnings,
    run_config: runConfig,
    prompt_packets: packets.map((packet) => ({
      provider: packet.provider,
      provider_instance_id: packet.providerInstanceId,
      slot: packet.candidateSlot,
      profile_id: packet.profileId,
      transport: packet.transport
    })),
    candidates: prepared.manifests
  };
}
