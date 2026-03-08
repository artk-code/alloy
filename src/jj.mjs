import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class JjAdapter {
  constructor({
    binary = 'jj',
    userName = 'Alloy',
    userEmail = 'alloy@local.invalid'
  } = {}) {
    this.binary = binary;
    this.userName = userName;
    this.userEmail = userEmail;
  }

  async bootstrapWorkspace({ workspacePath, taskId, candidateId, candidateSlot, providerInstanceId, baseRef }) {
    await this.run(['git', 'init', '.'], { cwd: workspacePath });
    await this.run([
      'commit',
      '-m',
      `Alloy base snapshot for ${taskId} ${candidateSlot} ${providerInstanceId}`
    ], { cwd: workspacePath });

    return {
      status: 'ready',
      binary: this.binary,
      base_ref: baseRef,
      initialized_at: new Date().toISOString(),
      task_id: taskId,
      candidate_id: candidateId,
      provider_instance_id: providerInstanceId,
      base_revision: await this.readRevision({ workspacePath, revset: '@-' }),
      working_revision: await this.readRevision({ workspacePath, revset: '@' })
    };
  }

  async captureCandidateSnapshot({
    workspacePath,
    description,
    patchPath,
    diffSummaryPath,
    statusPath
  }) {
    await this.run(['describe', '-m', description], { cwd: workspacePath });

    const [candidateRevision, baseRevision, statusText, diffSummary, patchText, nameOnlyText] = await Promise.all([
      this.readRevision({ workspacePath, revset: '@' }),
      this.readRevision({ workspacePath, revset: '@-' }),
      this.capture(['status'], { cwd: workspacePath }),
      this.capture(['diff', '--from', '@-', '--to', '@', '--summary'], { cwd: workspacePath }),
      this.capture(['diff', '--from', '@-', '--to', '@', '--git'], { cwd: workspacePath }),
      this.capture(['diff', '--from', '@-', '--to', '@', '--name-only'], { cwd: workspacePath })
    ]);

    await Promise.all([
      fs.writeFile(statusPath, statusText, 'utf8'),
      fs.writeFile(diffSummaryPath, diffSummary, 'utf8'),
      fs.writeFile(patchPath, patchText, 'utf8')
    ]);

    const changedFiles = nameOnlyText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      status: 'captured',
      captured_at: new Date().toISOString(),
      base_revision: baseRevision,
      candidate_revision: candidateRevision,
      changed_files: changedFiles,
      diff_summary: diffSummary.trim(),
      patch_stats: analyzeUnifiedDiff(patchText),
      has_changes: changedFiles.length > 0
    };
  }

  async readRevision({ workspacePath, revset }) {
    const template = [
      'commit_id',
      '"|"',
      'change_id',
      '"|"',
      'description.first_line()',
      '"|"',
      'author.name()',
      '"|"',
      'author.email()'
    ].join(' ++ ');
    const output = await this.capture([
      'log',
      '-r',
      revset,
      '--no-graph',
      '-T',
      `${template} ++ "\\n"`
    ], { cwd: workspacePath });
    const [commitId = '', changeId = '', description = '', authorName = '', authorEmail = ''] = output.trimEnd().split('|');
    return {
      revset,
      commit_id: commitId,
      change_id: changeId,
      description,
      author_name: authorName,
      author_email: authorEmail
    };
  }

  async capture(args, { cwd }) {
    const { stdout } = await execFileAsync(this.binary, buildArgs(this, args), {
      cwd,
      env: process.env
    });
    return stdout;
  }

  async run(args, { cwd }) {
    await execFileAsync(this.binary, buildArgs(this, args), {
      cwd,
      env: process.env
    });
  }
}

function buildArgs(adapter, args) {
  return [
    '--config', `user.name=${adapter.userName}`,
    '--config', `user.email=${adapter.userEmail}`,
    '--color=never',
    '--no-pager',
    '--quiet',
    ...args
  ];
}

function analyzeUnifiedDiff(patchText) {
  const lines = patchText.split('\n');
  let addedLines = 0;
  let removedLines = 0;
  let fileCount = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      fileCount += 1;
      continue;
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      continue;
    }
    if (line.startsWith('+')) {
      addedLines += 1;
      continue;
    }
    if (line.startsWith('-')) {
      removedLines += 1;
    }
  }

  return {
    file_count: fileCount,
    added_lines: addedLines,
    removed_lines: removedLines,
    total_changed_lines: addedLines + removedLines
  };
}
