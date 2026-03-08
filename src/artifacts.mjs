import fs from 'node:fs/promises';
import path from 'node:path';

export async function materializeRunArtifacts({ projectRoot, parsed, packets }) {
  const runDir = await prepareRunDirectory(projectRoot, parsed.task.task_id);
  const taskDir = path.join(runDir, 'task');
  const packetDir = path.join(runDir, 'prompt-packets');
  const candidateRoot = path.join(runDir, 'candidates');

  await fs.mkdir(taskDir, { recursive: true });
  await fs.mkdir(packetDir, { recursive: true });
  await fs.mkdir(candidateRoot, { recursive: true });

  await fs.writeFile(path.join(taskDir, 'source.task.md'), parsed.markdown, 'utf8');
  await fs.writeFile(path.join(taskDir, 'task.json'), JSON.stringify(parsed.task, null, 2) + '\n', 'utf8');
  await fs.writeFile(
    path.join(runDir, 'run-summary.json'),
    JSON.stringify({
      task_id: parsed.task.task_id,
      repo: parsed.task.repo,
      base_ref: parsed.task.base_ref,
      providers: parsed.task.providers,
      judge: parsed.task.judge,
      warnings: parsed.warnings,
      status: 'prepared'
    }, null, 2) + '\n',
    'utf8'
  );

  const manifests = [];

  for (const entry of packets) {
    const providerDir = path.join(candidateRoot, entry.provider);
    const workspaceDir = path.join(providerDir, 'workspace');
    const logsDir = path.join(providerDir, 'logs');
    const artifactsDir = path.join(providerDir, 'artifacts');
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(artifactsDir, { recursive: true });

    const promptJsonPath = path.join(packetDir, `${entry.provider}.json`);
    const promptMarkdownPath = path.join(packetDir, `${entry.provider}.md`);
    await fs.writeFile(promptJsonPath, JSON.stringify(entry.packet, null, 2) + '\n', 'utf8');
    await fs.writeFile(promptMarkdownPath, entry.markdown, 'utf8');

    const candidateId = `cand_${entry.candidateSlot.toLowerCase()}`;
    const manifest = {
      task_id: parsed.task.task_id,
      candidate_id: candidateId,
      candidate_slot: entry.candidateSlot,
      provider: entry.provider,
      status: 'planned',
      workspace_path: workspaceDir,
      prompt_packet_path: promptMarkdownPath,
      base_ref: parsed.task.base_ref,
      started_at: null,
      completed_at: null,
      changed_files: [],
      summary: null,
      artifact_paths: {
        stdout_path: path.join(logsDir, 'stdout.log'),
        stderr_path: path.join(logsDir, 'stderr.log'),
        patch_path: path.join(artifactsDir, 'candidate.patch'),
        summary_path: path.join(artifactsDir, 'summary.md')
      }
    };

    const manifestPath = path.join(providerDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    manifests.push({ provider: entry.provider, manifestPath, workspaceDir });
  }

  return { runDir, manifests };
}

async function prepareRunDirectory(projectRoot, taskId) {
  const runsRoot = path.join(projectRoot, 'runs');
  await fs.mkdir(runsRoot, { recursive: true });
  const baseDir = path.join(runsRoot, taskId);

  try {
    await fs.access(baseDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const versioned = `${baseDir}_${timestamp}`;
    await fs.mkdir(versioned, { recursive: true });
    return versioned;
  } catch {
    await fs.mkdir(baseDir, { recursive: true });
    return baseDir;
  }
}
