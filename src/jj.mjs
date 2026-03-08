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
    return this.captureDiffRange({
      workspacePath,
      fromRev: '@-',
      toRev: '@',
      patchPath,
      diffSummaryPath,
      statusPath,
      role: 'candidate'
    });
  }

  async captureDiffRange({
    workspacePath,
    fromRev,
    toRev,
    patchPath,
    diffSummaryPath,
    statusPath,
    role = 'range'
  }) {
    const [toRevision, baseRevision, currentRevision, statusText, diffSummary, patchText, nameOnlyText] = await Promise.all([
      this.readRevision({ workspacePath, revset: toRev }),
      this.readRevision({ workspacePath, revset: fromRev }),
      this.readRevision({ workspacePath, revset: '@' }),
      this.capture(['status'], { cwd: workspacePath }),
      this.capture(['diff', '--from', fromRev, '--to', toRev, '--summary'], { cwd: workspacePath }),
      this.capture(['diff', '--from', fromRev, '--to', toRev, '--git'], { cwd: workspacePath }),
      this.capture(['diff', '--from', fromRev, '--to', toRev, '--name-only'], { cwd: workspacePath })
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
      capture_role: role,
      captured_at: new Date().toISOString(),
      base_revision: baseRevision,
      candidate_revision: toRevision,
      current_revision: currentRevision,
      diff_from: fromRev,
      diff_to: toRev,
      changed_files: changedFiles,
      diff_summary: diffSummary.trim(),
      patch_stats: analyzeUnifiedDiff(patchText),
      has_changes: changedFiles.length > 0
    };
  }

  async splitRevisionByFiles({ workspacePath, revision = '@', files, message }) {
    const args = ['split', '-r', revision, ...files];
    if (message) {
      args.push('-m', message);
    }
    await this.run(args, { cwd: workspacePath });
    return {
      selected_revision: await this.readRevision({ workspacePath, revset: '@-' }),
      remaining_revision: await this.readRevision({ workspacePath, revset: '@' })
    };
  }

  async editRevision({ workspacePath, revision }) {
    await this.run(['edit', revision], { cwd: workspacePath });
    return this.readRevision({ workspacePath, revset: '@' });
  }

  async rebaseRevisionAfter({ workspacePath, revision, destination }) {
    await this.run(['rebase', '-r', revision, '-A', destination], { cwd: workspacePath });
    return this.readRevision({ workspacePath, revset: revision });
  }

  async squashRevisionInto({ workspacePath, fromRevision, intoRevision, paths = [], message = null }) {
    const args = ['squash', '--from', fromRevision, '--into', intoRevision, ...paths];
    if (message) {
      args.push('-m', message);
    } else {
      args.push('-u');
    }
    await this.run(args, { cwd: workspacePath });
    return {
      into_revision: await this.readRevision({ workspacePath, revset: intoRevision }),
      current_revision: await this.readRevision({ workspacePath, revset: '@' })
    };
  }

  suggestPublishRef({ taskId, synthesisId }) {
    const sanitize = (value) => String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `alloy/${sanitize(taskId)}/${sanitize(synthesisId)}`;
  }

  async readStackForPublication({ workspacePath, maxDepth = 5 }) {
    const revisions = [];

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const revset = depth === 0 ? '@' : `@${'-'.repeat(depth)}`;
      try {
        const revision = await this.readRevision({ workspacePath, revset });
        if (!revision?.commit_id) {
          break;
        }
        if (revisions.some((entry) => entry.commit_id === revision.commit_id)) {
          break;
        }
        revisions.push(revision);
      } catch {
        break;
      }
    }

    return revisions.reverse();
  }

  async exportPublicationPatchRange({ workspacePath, fromRev, toRev = '@', outputPath }) {
    const patchText = await this.capture(['diff', '--from', fromRev, '--to', toRev, '--git'], { cwd: workspacePath });
    await fs.writeFile(outputPath, patchText, 'utf8');
    return {
      output_path: outputPath,
      from_rev: fromRev,
      to_rev: toRev,
      patch_stats: analyzeUnifiedDiff(patchText)
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
