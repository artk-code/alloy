import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export class SessionManager {
  constructor({ projectRoot, stateDir = path.join(projectRoot, 'runtime', 'sessions') }) {
    this.projectRoot = projectRoot;
    this.stateDir = stateDir;
  }

  async createSessionRecord({
    kind,
    provider,
    profileId = 'default',
    transport = 'pipe',
    runDir = null,
    projectId = null,
    taskId = null,
    candidateId = null,
    command = null,
    cwd = null,
    metadata = {}
  }) {
    await fs.mkdir(this.stateDir, { recursive: true });
    const sessionId = `sess_${randomUUID()}`;
    const sessionDir = path.join(this.stateDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const record = {
      session_id: sessionId,
      kind,
      provider,
      profile_id: profileId,
      transport,
      run_dir: runDir,
      project_id: projectId,
      task_id: taskId,
      candidate_id: candidateId,
      cwd,
      pid: null,
      status: 'planned',
      command,
      started_at: null,
      completed_at: null,
      exit_code: null,
      signal: null,
      error: null,
      metadata,
      paths: {
        session_dir: sessionDir,
        record_path: path.join(sessionDir, 'session.json'),
        events_path: path.join(sessionDir, 'events.jsonl'),
        stdout_path: path.join(sessionDir, 'stdout.log'),
        stderr_path: path.join(sessionDir, 'stderr.log')
      }
    };

    await fs.writeFile(record.paths.events_path, '', 'utf8');
    await this.writeRecord(record);
    return record;
  }

  async runCommandSession({
    kind = 'candidate-run',
    provider,
    profileId = 'default',
    transport = 'pipe',
    runDir = null,
    projectId = null,
    taskId = null,
    candidateId = null,
    command,
    cwd,
    env = process.env,
    metadata = {},
    timeoutMs = 0,
    onEvent = () => {},
    onStdoutLine = () => {},
    onStderrLine = () => {}
  }) {
    const record = await this.createSessionRecord({
      kind,
      provider,
      profileId,
      transport,
      runDir,
      projectId,
      taskId,
      candidateId,
      command,
      cwd,
      metadata
    });

    const stdoutHandle = await fs.open(record.paths.stdout_path, 'a');
    const stderrHandle = await fs.open(record.paths.stderr_path, 'a');

    try {
      const child = spawnCommand({ command, cwd, env, transport });
      record.pid = child.pid ?? null;
      record.status = 'running';
      record.started_at = new Date().toISOString();
      await this.writeRecord(record);
      await this.appendEvent(record, event('session.started', record));
      await onEvent(event('session.started', record));

      const timeout = timeoutMs > 0
        ? setTimeout(() => child.kill('SIGTERM'), timeoutMs)
        : null;

      const exit = await Promise.all([
        pumpSessionStream({
          stream: child.stdout,
          fileHandle: stdoutHandle,
          record,
          streamName: 'stdout',
          onEvent,
          onLine: onStdoutLine,
          appendEvent: (payload) => this.appendEvent(record, payload)
        }),
        pumpSessionStream({
          stream: child.stderr,
          fileHandle: stderrHandle,
          record,
          streamName: 'stderr',
          onEvent,
          onLine: onStderrLine,
          appendEvent: (payload) => this.appendEvent(record, payload)
        }),
        waitForExit(child)
      ]).then(([, , value]) => value);

      if (timeout) {
        clearTimeout(timeout);
      }

      record.completed_at = new Date().toISOString();
      record.exit_code = exit.code;
      record.signal = exit.signal;
      record.status = exit.code === 0 ? 'completed' : 'failed';
      if (exit.signal) {
        record.error = `terminated_by_signal:${exit.signal}`;
      }
      await this.writeRecord(record);
      await this.appendEvent(record, event('session.completed', record));
      await onEvent(event('session.completed', record));
      return record;
    } catch (error) {
      record.completed_at = new Date().toISOString();
      record.status = 'failed';
      record.error = error.code === 'ENOENT' ? `binary_not_found:${command?.binary}` : (error.message || String(error));
      await this.writeRecord(record);
      await this.appendEvent(record, event('session.failed', record, { error: record.error }));
      await onEvent(event('session.failed', record, { error: record.error }));
      return record;
    } finally {
      await stdoutHandle.close();
      await stderrHandle.close();
    }
  }

  async recordExternalLaunch({
    kind = 'login-launch',
    provider,
    profileId = 'default',
    transport = 'pty',
    taskId = null,
    projectId = null,
    metadata = {}
  }) {
    const record = await this.createSessionRecord({
      kind,
      provider,
      profileId,
      transport,
      projectId,
      taskId,
      metadata
    });

    record.status = 'external-launched';
    record.started_at = new Date().toISOString();
    record.completed_at = record.started_at;
    await this.writeRecord(record);
    await this.appendEvent(record, event('session.external_launched', record));
    return record;
  }

  async listSessions({ projectId = null, taskId = null, provider = null, status = null, limit = 50 } = {}) {
    const entries = await fs.readdir(this.stateDir, { withFileTypes: true }).catch(() => []);
    const sessions = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const recordPath = path.join(this.stateDir, entry.name, 'session.json');
      try {
        const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
        sessions.push(record);
      } catch {
        continue;
      }
    }

    return sessions
      .filter((record) => !projectId || record.project_id === projectId)
      .filter((record) => !taskId || record.task_id === taskId)
      .filter((record) => !provider || record.provider === provider)
      .filter((record) => !status || record.status === status)
      .sort((left, right) => String(right.started_at || '').localeCompare(String(left.started_at || '')))
      .slice(0, limit);
  }

  async writeRecord(record) {
    await fs.writeFile(record.paths.record_path, JSON.stringify(record, null, 2) + '\n', 'utf8');
  }

  async appendEvent(record, payload) {
    await fs.appendFile(record.paths.events_path, `${JSON.stringify(payload)}\n`, 'utf8');
  }
}

function spawnCommand({ command, cwd, env, transport }) {
  if (!command?.binary) {
    throw new Error('Session command requires a binary.');
  }

  if (transport === 'pty') {
    const { binary, args } = wrapCommandForPty(command);
    return spawn(binary, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  return spawn(command.binary, command.args || [], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function wrapCommandForPty(command) {
  if (os.platform() === 'darwin') {
    return {
      binary: 'script',
      args: ['-q', '/dev/null', command.binary, ...(command.args || [])]
    };
  }

  if (os.platform() === 'linux') {
    return {
      binary: 'script',
      args: ['-qefc', shellEscape([command.binary, ...(command.args || [])]), '/dev/null']
    };
  }

  throw new Error('pty_transport_unavailable');
}

async function pumpSessionStream({ stream, fileHandle, record, streamName, onEvent, onLine, appendEvent }) {
  if (!stream) {
    return;
  }

  let buffered = '';
  for await (const chunk of stream) {
    const text = chunk.toString('utf8');
    await fileHandle.appendFile(chunk);
    buffered += text;

    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      const payload = event('session.output', record, {
        stream: streamName,
        line: trimmed
      });
      await appendEvent(payload);
      await onEvent(payload);
      if (trimmed) {
        await onLine(trimmed);
      }
    }
  }

  if (buffered.trim()) {
    const payload = event('session.output', record, {
      stream: streamName,
      line: buffered.trim()
    });
    await appendEvent(payload);
    await onEvent(payload);
    await onLine(buffered.trim());
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

function event(kind, record, extra = {}) {
  return {
    ts: new Date().toISOString(),
    kind,
    session_id: record.session_id,
    provider: record.provider,
    task_id: record.task_id,
    candidate_id: record.candidate_id,
    transport: record.transport,
    ...extra
  };
}

function shellEscape(parts) {
  return parts
    .map((part) => `'${String(part).replace(/'/g, `'\\''`)}'`)
    .join(' ');
}
