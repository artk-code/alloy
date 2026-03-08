import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildProviderCommand, DEFAULT_PROVIDER_SPECS } from './providers.mjs';

export async function runPreparedCandidates({
  runDir,
  task,
  packets,
  manifests,
  specs = DEFAULT_PROVIDER_SPECS,
  dryRun = false,
  maxTurns = 24
}) {
  const runEventsPath = path.join(runDir, 'events', 'run-events.jsonl');
  await fs.writeFile(runEventsPath, '', 'utf8');

  await appendJsonl(runEventsPath, {
    ts: new Date().toISOString(),
    kind: 'run.started',
    task_id: task.task_id,
    providers: task.providers,
    dry_run: dryRun
  });

  const manifestByProvider = new Map(manifests.map((manifest) => [manifest.provider, manifest]));
  const results = await Promise.allSettled(
    packets.map((packet) => {
      const manifestEntry = manifestByProvider.get(packet.provider);
      return runOneCandidate({
        runEventsPath,
        task,
        packet,
        manifestEntry,
        specs,
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
      status: 'failed',
      error: result.reason?.message || String(result.reason)
    };
  });

  const finalStatus = candidateResults.every((result) => result.status === 'completed' || result.status === 'dry-run')
    ? (dryRun ? 'dry-run' : 'completed')
    : 'completed_with_failures';

  const summary = {
    task_id: task.task_id,
    repo: task.repo,
    repo_path: task.repo_path || null,
    base_ref: task.base_ref,
    providers: task.providers,
    judge: task.judge,
    status: finalStatus,
    candidate_results: candidateResults
  };

  await fs.writeFile(path.join(runDir, 'run-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  await appendJsonl(runEventsPath, {
    ts: new Date().toISOString(),
    kind: 'run.completed',
    task_id: task.task_id,
    status: finalStatus
  });

  return { runEventsPath, summary };
}

async function runOneCandidate({ runEventsPath, task, packet, manifestEntry, specs, dryRun, maxTurns }) {
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
      status: 'dry-run',
      command: manifest.command
    };
  }

  manifest.status = 'running';
  await writeManifest(manifestEntry.manifestPath, manifest);
  await appendJsonl(runEventsPath, buildEvent('candidate.started', packet, { command: manifest.command }));
  await appendJsonl(manifest.events_path, buildEvent('candidate.started', packet, { command: manifest.command }));

  const stdoutHandle = await fs.open(manifest.artifact_paths.stdout_path, 'a');
  const stderrHandle = await fs.open(manifest.artifact_paths.stderr_path, 'a');
  let lastSummaryLine = '';

  try {
    const child = spawn(command.binary, command.args, {
      cwd: manifest.workspace_path,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timeoutMs = task.max_runtime_minutes * 60 * 1000;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    await Promise.all([
      pumpStream({
        stream: child.stdout,
        fileHandle: stdoutHandle,
        packet,
        candidateEventsPath: manifest.events_path,
        runEventsPath,
        streamName: 'stdout',
        onLine(line) {
          lastSummaryLine = line || lastSummaryLine;
        }
      }),
      pumpStream({
        stream: child.stderr,
        fileHandle: stderrHandle,
        packet,
        candidateEventsPath: manifest.events_path,
        runEventsPath,
        streamName: 'stderr'
      }),
      waitForExit(child)
        .then(({ code, signal }) => {
          clearTimeout(timeout);
          manifest.completed_at = new Date().toISOString();
          manifest.exit_code = code;
          manifest.status = code === 0 ? 'completed' : 'failed';
          manifest.summary = lastSummaryLine || null;
          if (signal) {
            manifest.error = `terminated_by_signal:${signal}`;
          }
          return { code, signal };
        })
    ]);
  } catch (error) {
    manifest.completed_at = new Date().toISOString();
    manifest.status = 'failed';
    manifest.error = error.code === 'ENOENT' ? `binary_not_found:${command.binary}` : (error.message || String(error));
  } finally {
    await stdoutHandle.close();
    await stderrHandle.close();
  }

  await writeManifest(manifestEntry.manifestPath, manifest);
  await appendJsonl(runEventsPath, buildEvent('candidate.completed', packet, {
    status: manifest.status,
    exit_code: manifest.exit_code,
    error: manifest.error,
    summary: manifest.summary
  }));
  await appendJsonl(manifest.events_path, buildEvent('candidate.completed', packet, {
    status: manifest.status,
    exit_code: manifest.exit_code,
    error: manifest.error,
    summary: manifest.summary
  }));

  return {
    provider: packet.provider,
    candidate_slot: packet.candidateSlot,
    status: manifest.status,
    exit_code: manifest.exit_code,
    error: manifest.error,
    summary: manifest.summary
  };
}

async function pumpStream({ stream, fileHandle, packet, candidateEventsPath, runEventsPath, streamName, onLine = () => {} }) {
  if (!stream) {
    return;
  }

  let buffer = '';

  for await (const chunk of stream) {
    const text = chunk.toString('utf8');
    await fileHandle.appendFile(text);
    buffer += text;

    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }
      const line = buffer.slice(0, newlineIndex).trimEnd();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      onLine(line);
      const event = buildStreamEvent(packet, streamName, line);
      await appendJsonl(candidateEventsPath, event);
      await appendJsonl(runEventsPath, event);
    }
  }

  const finalLine = buffer.trim();
  if (finalLine) {
    onLine(finalLine);
    const event = buildStreamEvent(packet, streamName, finalLine);
    await appendJsonl(candidateEventsPath, event);
    await appendJsonl(runEventsPath, event);
  }
}

function buildStreamEvent(packet, streamName, line) {
  const base = buildEvent('candidate.stream', packet, { stream: streamName, line });
  try {
    base.parsed = JSON.parse(line);
  } catch {
    base.parsed = null;
  }
  return base;
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

async function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
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
