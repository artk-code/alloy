import fs from 'node:fs/promises';
import path from 'node:path';

import { JjAdapter } from './jj.mjs';

export async function materializeRunArtifacts({ projectRoot, parsed, packets, runConfig = null }) {
  const jj = new JjAdapter();
  const runDir = await prepareRunDirectory(projectRoot, parsed.task.task_id);
  const taskDir = path.join(runDir, 'task');
  const packetDir = path.join(runDir, 'prompt-packets');
  const candidateRoot = path.join(runDir, 'candidates');
  const eventsDir = path.join(runDir, 'events');

  await fs.mkdir(taskDir, { recursive: true });
  await fs.mkdir(packetDir, { recursive: true });
  await fs.mkdir(candidateRoot, { recursive: true });
  await fs.mkdir(eventsDir, { recursive: true });

  await fs.writeFile(path.join(taskDir, 'source.task.md'), parsed.markdown, 'utf8');
  await fs.writeFile(path.join(taskDir, 'task.json'), JSON.stringify(parsed.task, null, 2) + '\n', 'utf8');
  await fs.writeFile(
    path.join(runDir, 'run-summary.json'),
    JSON.stringify({
      task_id: parsed.task.task_id,
      repo: parsed.task.repo,
      repo_path: parsed.task.repo_path || null,
      base_ref: parsed.task.base_ref,
      providers: parsed.task.providers,
      judge: parsed.task.judge,
      warnings: parsed.warnings,
      candidate_count: packets.length,
      run_config: runConfig,
      status: 'prepared'
    }, null, 2) + '\n',
    'utf8'
  );

  const manifests = [];

  for (const entry of packets) {
    const providerDir = path.join(candidateRoot, entry.candidateKey);
    const workspaceDir = path.join(providerDir, 'workspace');
    const logsDir = path.join(providerDir, 'logs');
    const artifactsDir = path.join(providerDir, 'artifacts');
    const candidateEventsPath = path.join(providerDir, 'events.jsonl');
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(artifactsDir, { recursive: true });

    if (parsed.task.repo_path) {
      await seedWorkspace(parsed.task.repo_path, workspaceDir);
    }

    const promptJsonPath = path.join(packetDir, `${entry.candidateKey}.json`);
    const promptMarkdownPath = path.join(packetDir, `${entry.candidateKey}.md`);
    await fs.writeFile(promptJsonPath, JSON.stringify(entry.packet, null, 2) + '\n', 'utf8');
    await fs.writeFile(promptMarkdownPath, entry.markdown, 'utf8');
    await fs.writeFile(candidateEventsPath, '', 'utf8');

    const candidateId = `cand_${entry.candidateSlot.toLowerCase()}`;
    const jjState = await jj.bootstrapWorkspace({
      workspacePath: workspaceDir,
      taskId: parsed.task.task_id,
      candidateId,
      candidateSlot: entry.candidateSlot,
      providerInstanceId: entry.providerInstanceId,
      baseRef: parsed.task.base_ref
    }).catch((error) => ({
      status: error.code === 'ENOENT' ? 'unavailable' : 'failed',
      error: error.message || String(error),
      initialized_at: new Date().toISOString()
    }));
    const manifest = {
      task_id: parsed.task.task_id,
      candidate_id: candidateId,
      candidate_key: entry.candidateKey,
      candidate_slot: entry.candidateSlot,
      provider: entry.provider,
      provider_instance_id: entry.providerInstanceId,
      agent_index: entry.agentIndex,
      profile_id: entry.profileId,
      transport: entry.transport,
      status: 'planned',
      workspace_path: workspaceDir,
      prompt_packet_path: promptMarkdownPath,
      prompt_packet_json_path: promptJsonPath,
      base_ref: parsed.task.base_ref,
      started_at: null,
      completed_at: null,
      changed_files: [],
      summary: null,
      verification: null,
      evaluation: null,
      command: null,
      exit_code: null,
      error: null,
      jj: jjState,
      session_id: null,
      session_record_path: null,
      events_path: candidateEventsPath,
      artifact_paths: {
        stdout_path: path.join(logsDir, 'stdout.log'),
        stderr_path: path.join(logsDir, 'stderr.log'),
        patch_path: path.join(artifactsDir, 'candidate.patch'),
        diff_summary_path: path.join(artifactsDir, 'diff-summary.txt'),
        status_path: path.join(artifactsDir, 'jj-status.txt'),
        summary_path: path.join(artifactsDir, 'summary.md'),
        evaluation_path: path.join(artifactsDir, 'scorecard.json')
      }
    };

    const manifestPath = path.join(providerDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    manifests.push({
      provider: entry.provider,
      providerInstanceId: entry.providerInstanceId,
      candidateSlot: entry.candidateSlot,
      candidateKey: entry.candidateKey,
      manifestPath,
      workspaceDir,
      promptJsonPath,
      promptMarkdownPath,
      eventsPath: candidateEventsPath
    });
  }

  return { runDir, manifests };
}

async function prepareRunDirectory(projectRoot, taskId) {
  const runsRoot = path.join(projectRoot, 'runs');
  await fs.mkdir(runsRoot, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(runsRoot, `${taskId}_${timestamp}`);
  await fs.mkdir(runDir, { recursive: true });
  return runDir;
}

async function seedWorkspace(sourcePath, destinationPath) {
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat || !sourceStat.isDirectory()) {
    throw new Error(`repo_path does not exist or is not a directory: ${sourcePath}`);
  }

  const entries = await fs.readdir(sourcePath);
  for (const entry of entries) {
    await fs.cp(path.join(sourcePath, entry), path.join(destinationPath, entry), { recursive: true });
  }
}
