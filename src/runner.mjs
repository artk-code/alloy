import fs from 'node:fs/promises';
import path from 'node:path';

import { evaluateRun } from './evaluation.mjs';
import { JjAdapter } from './jj.mjs';
import { buildProviderCommand, buildProviderEnv, DEFAULT_PROVIDER_SPECS } from './providers.mjs';
import { SessionManager } from './session-manager.mjs';
import { runAcceptanceChecks } from './verify.mjs';

export async function runPreparedCandidates({
  runDir,
  task,
  packets,
  manifests,
  specs = DEFAULT_PROVIDER_SPECS,
  sessionManager = null,
  dryRun = false,
  maxTurns = 24
}) {
  const jj = new JjAdapter();
  const manager = sessionManager || new SessionManager({
    projectRoot: path.resolve(runDir, '..', '..')
  });
  const runEventsPath = path.join(runDir, 'events', 'run-events.jsonl');
  await fs.writeFile(runEventsPath, '', 'utf8');

  await appendJsonl(runEventsPath, {
    ts: new Date().toISOString(),
    kind: 'run.started',
    task_id: task.task_id,
    providers: packets.map((packet) => packet.providerInstanceId),
    dry_run: dryRun
  });

  const manifestByCandidateKey = new Map(manifests.map((manifest) => [manifest.candidateKey, manifest]));
  const results = await Promise.allSettled(
    packets.map((packet) => {
      const manifestEntry = manifestByCandidateKey.get(packet.candidateKey);
      return runOneCandidate({
        runDir,
        runEventsPath,
        task,
        packet,
        manifestEntry,
        specs,
        jj,
        sessionManager: manager,
        dryRun,
        maxTurns
      });
    })
  );

  const candidateResults = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      provider: packets[index].provider,
      candidate_slot: packets[index].candidateSlot,
      provider_instance_id: packets[index].providerInstanceId,
      status: 'failed',
      error: result.reason?.message || String(result.reason)
    };
  });

  const finalStatus = candidateResults.every((result) => result.status === 'completed' || result.status === 'dry-run')
    ? (dryRun ? 'dry-run' : 'completed')
    : 'completed_with_failures';

  const materializedManifests = await Promise.all(manifests.map((entry) => readJson(entry.manifestPath)));
  const evaluation = dryRun
    ? null
    : await evaluateRun({
      task,
      manifests: materializedManifests,
      outputPath: path.join(runDir, 'evaluation.json')
    });

  if (evaluation) {
    const byCandidateId = new Map(evaluation.candidates.map((candidate) => [candidate.candidate_id, candidate]));
    await Promise.all(manifests.map(async (entry) => {
      const manifest = await readJson(entry.manifestPath);
      manifest.evaluation = byCandidateId.get(manifest.candidate_id) || null;
      if (manifest.artifact_paths?.evaluation_path) {
        await fs.writeFile(manifest.artifact_paths.evaluation_path, JSON.stringify(manifest.evaluation, null, 2) + '\n', 'utf8');
      }
      await writeManifest(entry.manifestPath, manifest);
    }));
    await appendJsonl(runEventsPath, {
      ts: new Date().toISOString(),
      kind: 'evaluation.completed',
      task_id: task.task_id,
      decision: evaluation.decision
    });
  }

  const summary = {
    task_id: task.task_id,
    source_system: task.source_system,
    source_task_id: task.source_task_id || null,
    repo: task.repo,
    repo_path: task.repo_path || null,
    base_ref: task.base_ref,
    providers: task.providers,
    judge: task.judge,
    run_config: task.run_config || null,
    status: finalStatus,
    candidate_results: candidateResults,
    evaluation
  };

  await fs.writeFile(path.join(runDir, 'run-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  await appendJsonl(runEventsPath, {
    ts: new Date().toISOString(),
    kind: 'run.completed',
    task_id: task.task_id,
    status: finalStatus,
    source_system: task.source_system,
    source_task_id: task.source_task_id || null
  });

  return { runEventsPath, summary };
}

async function runOneCandidate({ runDir, runEventsPath, task, packet, manifestEntry, specs, jj, sessionManager, dryRun, maxTurns }) {
  if (!manifestEntry) {
    throw new Error(`Missing manifest for provider ${packet.provider}`);
  }

  const manifest = await readJson(manifestEntry.manifestPath);
  const command = buildProviderCommand({
    provider: packet.provider,
    prompt: packet.markdown,
    options: { maxTurns },
    specs
  });

  manifest.command = {
    binary: command.binary,
    args: command.args,
    event_format: command.eventFormat,
    docs: command.docs
  };
  manifest.started_at = new Date().toISOString();

  if (dryRun) {
    manifest.status = 'planned';
    manifest.summary = 'Dry run only; command prepared but not executed.';
    await writeManifest(manifestEntry.manifestPath, manifest);
    await appendJsonl(runEventsPath, buildEvent('candidate.dry_run', packet, { command: manifest.command }));
    await appendJsonl(manifest.events_path, buildEvent('candidate.dry_run', packet, { command: manifest.command }));
    return {
      provider: packet.provider,
      candidate_slot: packet.candidateSlot,
      provider_instance_id: packet.providerInstanceId,
      status: 'dry-run',
      command: manifest.command
    };
  }

  manifest.status = 'running';
  manifest.verification = null;
  await writeManifest(manifestEntry.manifestPath, manifest);
  await appendJsonl(runEventsPath, buildEvent('candidate.started', packet, { command: manifest.command }));
  await appendJsonl(manifest.events_path, buildEvent('candidate.started', packet, { command: manifest.command }));
  let lastSummaryLine = '';

  try {
    const session = await sessionManager.runCommandSession({
      kind: 'candidate-run',
      provider: packet.provider,
      profileId: packet.profileId,
      transport: packet.transport,
      runDir,
      taskId: task.task_id,
      candidateId: manifest.candidate_id,
      command,
      cwd: manifest.workspace_path,
      env: buildProviderEnv(process.env),
      metadata: {
        candidate_slot: packet.candidateSlot,
        provider_instance_id: packet.providerInstanceId
      },
      timeoutMs: task.max_runtime_minutes * 60 * 1000,
      onEvent: async (event) => {
        const mapped = mapSessionEvent(packet, event);
        await appendJsonl(runEventsPath, mapped);
        await appendJsonl(manifest.events_path, mapped);
      },
      onStdoutLine(line) {
        lastSummaryLine = line || lastSummaryLine;
      }
    });

    manifest.session_id = session.session_id;
    manifest.session_record_path = session.paths.record_path;
    manifest.artifact_paths.stdout_path = session.paths.stdout_path;
    manifest.artifact_paths.stderr_path = session.paths.stderr_path;
    manifest.completed_at = session.completed_at;
    manifest.exit_code = session.exit_code;
    manifest.status = session.status;
    manifest.summary = lastSummaryLine || manifest.summary || null;
    manifest.error = session.error;
  } catch (error) {
    manifest.completed_at = new Date().toISOString();
    manifest.status = 'failed';
    manifest.error = error.code === 'ENOENT' ? `binary_not_found:${command.binary}` : (error.message || String(error));
  }

  if (manifest.status === 'completed' && Array.isArray(task.acceptance_checks) && task.acceptance_checks.length > 0) {
    await appendJsonl(runEventsPath, buildEvent('verification.started', packet, {
      commands: task.acceptance_checks
    }));
    await appendJsonl(manifest.events_path, buildEvent('verification.started', packet, {
      commands: task.acceptance_checks
    }));

    manifest.verification = await runAcceptanceChecks({
      workspacePath: manifest.workspace_path,
      commands: task.acceptance_checks,
      outputDir: path.dirname(manifest.artifact_paths.summary_path)
    });

    if (manifest.verification.status !== 'pass') {
      manifest.status = 'failed';
      manifest.error = manifest.error || 'verification_failed';
    }

    await appendJsonl(runEventsPath, buildEvent('verification.completed', packet, {
      verification: manifest.verification
    }));
    await appendJsonl(manifest.events_path, buildEvent('verification.completed', packet, {
      verification: manifest.verification
    }));
  }

  await captureJjArtifacts({
    jj,
    task,
    packet,
    manifest,
    manifestPath: manifestEntry.manifestPath,
    runEventsPath
  });

  await writeManifest(manifestEntry.manifestPath, manifest);
  await appendJsonl(runEventsPath, buildEvent('candidate.completed', packet, {
    status: manifest.status,
    exit_code: manifest.exit_code,
    error: manifest.error,
    summary: manifest.summary,
    verification: manifest.verification
  }));
  await appendJsonl(manifest.events_path, buildEvent('candidate.completed', packet, {
    status: manifest.status,
    exit_code: manifest.exit_code,
    error: manifest.error,
    summary: manifest.summary,
    verification: manifest.verification
  }));

  return {
    provider: packet.provider,
    candidate_slot: packet.candidateSlot,
    provider_instance_id: packet.providerInstanceId,
    status: manifest.status,
    exit_code: manifest.exit_code,
    error: manifest.error,
    summary: manifest.summary,
    verification: manifest.verification
  };
}

function buildEvent(kind, packet, extra = {}) {
  return {
    ts: new Date().toISOString(),
    kind,
    provider: packet.provider,
    candidate_slot: packet.candidateSlot,
    task_id: packet.packet.task_id,
    ...extra
  };
}

function mapSessionEvent(packet, event) {
  if (event.kind !== 'session.output') {
    return buildEvent(event.kind, packet, {
      session_id: event.session_id,
      transport: event.transport,
      exit_code: event.exit_code ?? null,
      signal: event.signal ?? null,
      error: event.error ?? null
    });
  }

  const mapped = buildEvent('candidate.stream', packet, {
    session_id: event.session_id,
    transport: event.transport,
    stream: event.stream,
    line: event.line
  });
  try {
    mapped.parsed = JSON.parse(event.line);
  } catch {
    mapped.parsed = null;
  }
  return mapped;
}

async function captureJjArtifacts({ jj, task, packet, manifest, manifestPath, runEventsPath }) {
  if (!manifest.jj || manifest.jj.status !== 'ready') {
    return;
  }

  await appendJsonl(runEventsPath, buildEvent('jj.capture.started', packet));
  await appendJsonl(manifest.events_path, buildEvent('jj.capture.started', packet));

  try {
    const snapshot = await jj.captureCandidateSnapshot({
      workspacePath: manifest.workspace_path,
      description: `Alloy candidate ${task.task_id} ${packet.candidateSlot} ${packet.providerInstanceId}`,
      patchPath: manifest.artifact_paths.patch_path,
      diffSummaryPath: manifest.artifact_paths.diff_summary_path,
      statusPath: manifest.artifact_paths.status_path
    });

    manifest.changed_files = snapshot.changed_files;
    manifest.jj = {
      ...manifest.jj,
      ...snapshot
    };

    await appendJsonl(runEventsPath, buildEvent('jj.capture.completed', packet, {
      changed_files: snapshot.changed_files,
      patch_stats: snapshot.patch_stats
    }));
    await appendJsonl(manifest.events_path, buildEvent('jj.capture.completed', packet, {
      changed_files: snapshot.changed_files,
      patch_stats: snapshot.patch_stats
    }));
  } catch (error) {
    manifest.jj = {
      ...manifest.jj,
      status: 'failed',
      error: error.message || String(error)
    };
    await appendJsonl(runEventsPath, buildEvent('jj.capture.failed', packet, {
      error: manifest.jj.error
    }));
    await appendJsonl(manifest.events_path, buildEvent('jj.capture.failed', packet, {
      error: manifest.jj.error
    }));
  }

  await writeManifest(manifestPath, manifest);
}

async function appendJsonl(filePath, value) {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeManifest(filePath, manifest) {
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
