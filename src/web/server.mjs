import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildTerminalLoginLaunch } from '../auth-launch.mjs';
import { prepareTaskFromFile, prepareTaskFromMarkdown, runTaskFromPrepared } from '../orchestrator.mjs';
import { parseTaskBrief } from '../parser.mjs';
import { doctorProviders, getProviderLoginCommand } from '../providers.mjs';
import { SessionManager } from '../session-manager.mjs';
import { getTaskDetail, listTaskCards } from './data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const uiRoot = path.join(projectRoot, 'ui');
const host = process.env.ALLOY_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.ALLOY_PORT || '4173', 10);
const sessionManager = new SessionManager({ projectRoot });

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      return sendJson(res, 400, { error: 'missing_url' });
    }

    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === 'GET' && url.pathname === '/api/providers') {
      const report = await doctorProviders();
      const sessions = await sessionManager.listSessions({ limit: 20 });
      return sendJson(res, 200, {
        ...report,
        active_sessions: sessions.filter((session) => session.status === 'running'),
        recent_sessions: sessions.slice(0, 10)
      });
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/open-login')) {
      const provider = url.pathname.split('/')[3];
      return sendJson(res, 200, await openLogin(provider));
    }

    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      return sendJson(res, 200, { tasks: await listTaskCards(projectRoot) });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/tasks/')) {
      const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
      const detail = await getTaskDetail(projectRoot, taskId);
      if (!detail) {
        return sendJson(res, 404, { error: 'task_not_found' });
      }
      return sendJson(res, 200, detail);
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      return sendJson(res, 200, {
        sessions: await sessionManager.listSessions({
          taskId: url.searchParams.get('taskId') || null,
          provider: url.searchParams.get('provider') || null,
          status: url.searchParams.get('status') || null,
          limit: Number.parseInt(url.searchParams.get('limit') || '50', 10)
        })
      });
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/run/')) {
      const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
      return sendJson(res, 200, await runTask(taskId, await readJsonBody(req), url.searchParams));
    }

    if (req.method === 'POST' && url.pathname === '/api/parse-markdown') {
      const body = await readJsonBody(req);
      if (!body.markdown) {
        return sendJson(res, 400, { error: 'missing_markdown' });
      }
      const sourcePath = body.sourcePath ? path.resolve(projectRoot, body.sourcePath) : '<web-ui>';
      const parsed = parseTaskBrief(body.markdown, sourcePath);
      if (parsed.task.repo_path && sourcePath !== '<web-ui>') {
        parsed.task.repo_path = path.resolve(path.dirname(sourcePath), parsed.task.repo_path);
      }
      return sendJson(res, 200, {
        source_task: parsed.task,
        validation: {
          ok: parsed.ok,
          errors: parsed.errors,
          warnings: parsed.warnings
        }
      });
    }

    return serveStatic(res, url.pathname);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.error(`Alloy web UI listening at http://${host}:${port}`);
});

async function runTask(taskId, body, searchParams) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail) {
    throw new Error(`Unknown task: ${taskId}`);
  }

  const dryRun = searchParams.get('dryRun') !== 'false';
  let preparedTask;
  if (body?.markdown) {
    preparedTask = await prepareTaskFromMarkdown({
      projectRoot,
      markdown: body.markdown,
      sourcePath: detail.markdown_path,
      runConfig: body.run_config || detail.run_config
    });
  } else {
    preparedTask = await prepareTaskFromFile({
      projectRoot,
      taskFilePath: detail.markdown_path,
      runConfig: body.run_config || detail.run_config
    });
  }

  if (body?.action === 'prepare') {
    return preparedTask.output;
  }

  return runTaskFromPrepared({
    task: preparedTask.task,
    packets: preparedTask.packets,
    prepared: preparedTask.prepared,
    dryRun,
    maxTurns: 24,
    sessionManager
  });
}

async function openLogin(provider) {
  const login = getProviderLoginCommand(provider);
  const launcher = buildTerminalLoginLaunch({ projectRoot, provider });
  const session = await sessionManager.recordExternalLaunch({
    provider,
    profileId: 'default',
    transport: launcher.supported ? 'pty' : 'external',
    metadata: {
      launcher: launcher.launcher,
      human_command: launcher.human_command
    }
  });

  if (!launcher.supported) {
    return {
      launched: false,
      provider,
      login,
      launcher,
      session,
      message: 'Terminal auto-launch is not supported on this platform. Run the command manually.'
    };
  }

  const launchResult = await new Promise((resolve, reject) => {
    const child = spawn(launcher.launcher, launcher.args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'ignore',
      detached: false
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ launched: true });
      } else {
        reject(new Error(`login launcher exited with code ${code}`));
      }
    });
  }).catch((error) => ({ launched: false, error: error.message || String(error) }));

  return {
    launched: launchResult.launched,
    provider,
    login,
    launcher,
    session,
    error: launchResult.error || null
  };
}

async function serveStatic(res, pathname) {
  const resolved = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(uiRoot, resolved);
  try {
    const data = await fs.readFile(filePath);
    const contentType = filePath.endsWith('.css')
      ? 'text/css'
      : filePath.endsWith('.js')
        ? 'application/javascript'
        : 'text/html';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }
}

async function readJsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString('utf8');
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value, null, 2));
}
