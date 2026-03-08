import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildTerminalCommandLaunch, buildTerminalLoginLaunch } from '../auth-launch.mjs';
import { runBlindReviewAgent } from '../blind-review-agent.mjs';
import { prepareTaskFromFile, prepareTaskFromMarkdown, runTaskFromPrepared } from '../orchestrator.mjs';
import { parseTaskBrief } from '../parser.mjs';
import { buildProviderEnv, doctorProviders, getProviderLoginCommand, getProviderTestCommand } from '../providers.mjs';
import { SessionManager } from '../session-manager.mjs';
import { approvePublication, pushPublication, refreshPublicationState, synthesizeRun } from '../synthesis.mjs';
import { listGuideDocs, readGuideDoc } from './docs-data.mjs';
import { getCandidateDiff, getCandidateJj, getSynthesisDiff, getTaskDetail, getTaskPublication, listTaskCards } from './data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const uiRoot = path.join(projectRoot, 'ui');
const host = process.env.ALLOY_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.ALLOY_PORT || '4173', 10);
const sessionManager = new SessionManager({ projectRoot });
const MAX_TASK_IMPORT_BYTES = 256 * 1024;
const ALLOWED_TASK_IMPORT_EXTENSIONS = new Set(['.md', '.markdown']);

export function createServer() {
  return http.createServer(async (req, res) => {
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

      if (req.method === 'POST' && url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/open-test')) {
        const provider = url.pathname.split('/')[3];
        return sendJson(res, 200, await openAuthTest(provider));
      }

      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        return sendJson(res, 200, { tasks: await listTaskCards(projectRoot) });
      }

      if (req.method === 'POST' && url.pathname === '/api/tasks/create') {
        try {
          return sendJson(res, 200, await createTaskFile(projectRoot, await readJsonBody(req)));
        } catch (error) {
          const statusCode = error.validation ? 400 : 500;
          return sendJson(res, statusCode, {
            error: error.message || String(error),
            validation: error.validation || null
          });
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/docs') {
        return sendJson(res, 200, { docs: listGuideDocs() });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/docs/')) {
        const docId = decodeURIComponent(url.pathname.split('/')[3] || '');
        const doc = await readGuideDoc(projectRoot, docId);
        return doc
          ? sendJson(res, 200, doc)
          : sendJson(res, 404, { error: 'doc_not_found' });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/tasks/')) {
        const segments = url.pathname.split('/').filter(Boolean);
        const taskId = decodeURIComponent(segments[2] || '');

        if (segments[3] === 'candidates' && segments[4] && segments[5] === 'diff') {
          const payload = await getCandidateDiff(projectRoot, taskId, decodeURIComponent(segments[4]));
          return payload
            ? sendJson(res, 200, payload)
            : sendJson(res, 404, { error: 'candidate_not_found' });
        }

        if (segments[3] === 'candidates' && segments[4] && segments[5] === 'files') {
          const payload = await getCandidateDiff(projectRoot, taskId, decodeURIComponent(segments[4]));
          return payload
            ? sendJson(res, 200, {
                task_id: payload.task_id,
                candidate_id: payload.candidate_id,
                files: payload.files
              })
            : sendJson(res, 404, { error: 'candidate_not_found' });
        }

        if (segments[3] === 'candidates' && segments[4] && segments[5] === 'jj') {
          const payload = await getCandidateJj(projectRoot, taskId, decodeURIComponent(segments[4]));
          return payload
            ? sendJson(res, 200, payload)
            : sendJson(res, 404, { error: 'candidate_not_found' });
        }

        if (segments[3] === 'synthesis' && segments[4] === 'diff') {
          const payload = await getSynthesisDiff(projectRoot, taskId);
          return payload
            ? sendJson(res, 200, payload)
            : sendJson(res, 404, { error: 'synthesis_not_found' });
        }

        if (segments[3] === 'publication' && !segments[4]) {
          const payload = await getTaskPublication(projectRoot, taskId);
          return payload
            ? sendJson(res, 200, payload)
            : sendJson(res, 404, { error: 'publication_not_found' });
        }

        const detail = await getTaskDetail(projectRoot, taskId);
        if (!detail) {
          return sendJson(res, 404, { error: 'task_not_found' });
        }
        detail.current_sessions = await sessionManager.listSessions({ taskId, limit: 20 });
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

      if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/synthesize')) {
        const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return sendJson(res, 200, await synthesizeTask(taskId, await readJsonBody(req)));
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/publication/preview')) {
        const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return sendJson(res, 200, await previewPublication(taskId));
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/publication/approve')) {
        const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return sendJson(res, 200, await approveTaskPublication(taskId, await readJsonBody(req)));
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/publication/push')) {
        const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return sendJson(res, 200, await pushTaskPublication(taskId, await readJsonBody(req)));
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/blind-review/run')) {
        const taskId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return sendJson(res, 200, await runTaskBlindReview(taskId, await readJsonBody(req)));
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
}

export function startServer() {
  const server = createServer();
  server.listen(port, host, () => {
    console.error(`Alloy web UI listening at http://${host}:${port}`);
  });
  return server;
}

async function runTask(taskId, body, searchParams) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail) {
    throw new Error(`Unknown task: ${taskId}`);
  }

  const dryRun = body?.dry_run ?? (searchParams.get('dryRun') !== 'false');
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
      env: buildProviderEnv(process.env),
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

async function synthesizeTask(taskId, body) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail || !detail.run_dir) {
    throw new Error(`No completed run is available for synthesis on task ${taskId}`);
  }

  const manifest = await synthesizeRun({
    runDir: detail.run_dir,
    task: {
      ...detail.task,
      run_config: detail.run_config
    },
    mergePlan: body?.merge_plan || null,
    strategy: body?.strategy || 'winner_only',
    winnerCandidateId: body?.winner_candidate_id || null,
    fileSelections: body?.file_selections || {},
    selectedBy: body?.selected_by || 'human'
  });

  return {
    task_id: taskId,
    synthesis: manifest
  };
}

async function previewPublication(taskId) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail || !detail.run_dir) {
    throw new Error(`No completed run is available for publication preview on task ${taskId}`);
  }

  const publication = await refreshPublicationState({
    runDir: detail.run_dir,
    task: {
      ...detail.task,
      run_config: detail.run_config
    }
  });

  return {
    task_id: taskId,
    publication
  };
}

async function approveTaskPublication(taskId, body) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail || !detail.run_dir) {
    throw new Error(`No completed run is available for publication approval on task ${taskId}`);
  }
  if (!detail.synthesis) {
    throw new Error(`No synthesized result is available for publication approval on task ${taskId}`);
  }

  const publication = await approvePublication({
    runDir: detail.run_dir,
    task: {
      ...detail.task,
      run_config: detail.run_config
    },
    approvedBy: body?.approved_by || 'human-ui',
    approvedAt: body?.approved_at || new Date().toISOString(),
    note: body?.note || null
  });

  return {
    task_id: taskId,
    publication
  };
}

async function pushTaskPublication(taskId, body) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail || !detail.run_dir) {
    throw new Error(`No completed run is available for publication push on task ${taskId}`);
  }
  if (!detail.synthesis) {
    throw new Error(`No synthesized result is available for publication push on task ${taskId}`);
  }

  const publication = await pushPublication({
    runDir: detail.run_dir,
    task: {
      ...detail.task,
      run_config: detail.run_config
    },
    remote: body?.remote || null,
    bookmark: body?.target_branch_or_bookmark || null
  });

  return {
    task_id: taskId,
    publication
  };
}

export async function createTaskFile(rootDir, body) {
  const sourcePath = cleanTaskPathInput(body?.source_path);
  const { markdown, securityWarnings } = await resolveTaskMarkdown(rootDir, body?.markdown, sourcePath);
  const parsed = parseTaskBrief(markdown, sourcePath || '<web-ui>');

  if (!parsed.ok) {
    const message = parsed.errors.map((error) => error.message).join(' | ') || 'Task markdown failed validation.';
    const error = new Error(message);
    error.validation = {
      ok: parsed.ok,
      errors: parsed.errors,
      warnings: parsed.warnings
    };
    throw error;
  }

  const taskFilePath = resolveTaskOutputPath(rootDir, body?.output_name, parsed.task.task_id);
  await fs.mkdir(path.dirname(taskFilePath), { recursive: true });

  const exists = await fs.stat(taskFilePath).then(() => true).catch(() => false);
  if (exists) {
    throw new Error(`Task file already exists: ${taskFilePath}`);
  }

  await fs.writeFile(taskFilePath, markdown, 'utf8');

  return {
    task_id: parsed.task.task_id,
    markdown_path: taskFilePath,
    task: parsed.task,
    security_warnings: securityWarnings,
    validation: {
      ok: parsed.ok,
      errors: parsed.errors,
      warnings: parsed.warnings
    }
  };
}

async function runTaskBlindReview(taskId, body) {
  const detail = await getTaskDetail(projectRoot, taskId);
  if (!detail || !detail.run_dir) {
    throw new Error(`No completed run is available for blind review on task ${taskId}`);
  }
  if (!detail.latest_run?.evaluation?.blind_review || !detail.latest_run?.evaluation?.composer_plan) {
    throw new Error(`No blind review packet is available for task ${taskId}`);
  }

  const provider = body?.provider || detail.run_config?.judge || detail.task?.judge;
  if (!provider || provider === 'none') {
    throw new Error(`No blind review provider is configured for task ${taskId}`);
  }

  const providerConfig = (detail.run_config?.providers || []).find((entry) => entry.provider === provider) || null;
  const review = await runBlindReviewAgent({
    runDir: detail.run_dir,
    task: {
      ...detail.task,
      run_config: detail.run_config
    },
    provider,
    profileId: body?.profile_id || providerConfig?.profile_id || 'default',
    transport: body?.transport || providerConfig?.transport || 'pipe',
    sessionManager,
    maxTurns: Number.parseInt(body?.max_turns || '12', 10) || 12
  });

  return {
    task_id: taskId,
    blind_review_agent: review
  };
}

async function openAuthTest(provider) {
  const test = getProviderTestCommand(provider);
  const launcher = buildTerminalCommandLaunch({
    command: test.command.map(shellQuote).join(' ')
  });
  const session = await sessionManager.recordExternalLaunch({
    kind: 'auth-test-launch',
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
      test,
      launcher,
      session,
      message: 'Terminal auto-launch is not supported on this platform. Run the command manually.'
    };
  }

  const launchResult = await new Promise((resolve, reject) => {
    const child = spawn(launcher.launcher, launcher.args, {
      cwd: projectRoot,
      env: buildProviderEnv(process.env),
      stdio: 'ignore',
      detached: false
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ launched: true });
      } else {
        reject(new Error(`test launcher exited with code ${code}`));
      }
    });
  }).catch((error) => ({ launched: false, error: error.message || String(error) }));

  return {
    launched: launchResult.launched,
    provider,
    test,
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
    const contentType = contentTypeForStaticPath(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }
}

export function contentTypeForStaticPath(filePath) {
  if (filePath.endsWith('.css')) {
    return 'text/css';
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return 'application/javascript';
  }
  return 'text/html';
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function cleanTaskPathInput(value) {
  const next = String(value || '').trim();
  return next || null;
}

async function resolveTaskMarkdown(rootDir, inlineMarkdown, sourcePath) {
  const markdown = String(inlineMarkdown || '').trim();
  if (markdown) {
    return { markdown, securityWarnings: [] };
  }
  if (!sourcePath) {
    throw new Error('Provide task markdown or a source markdown path.');
  }

  const resolvedPath = path.resolve(rootDir, sourcePath);
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_TASK_IMPORT_EXTENSIONS.has(extension)) {
    throw new Error(`Only markdown imports are supported right now (.md, .markdown): ${resolvedPath}`);
  }

  const stats = await fs.stat(resolvedPath).catch(() => null);
  if (!stats || !stats.isFile()) {
    throw new Error(`Task source file not found: ${resolvedPath}`);
  }
  if (stats.size > MAX_TASK_IMPORT_BYTES) {
    throw new Error(`Task source file is too large (${stats.size} bytes). Limit is ${MAX_TASK_IMPORT_BYTES} bytes.`);
  }

  const importedMarkdown = await fs.readFile(resolvedPath, 'utf8');
  if (importedMarkdown.includes('\u0000')) {
    throw new Error(`Task source file appears to contain binary content: ${resolvedPath}`);
  }

  const securityWarnings = [];
  if (!resolvedPath.startsWith(`${rootDir}${path.sep}`) && resolvedPath !== rootDir) {
    securityWarnings.push('Imported markdown came from outside the Alloy workspace. Only import trusted local files in this testing build.');
  }
  securityWarnings.push('Imported markdown becomes Alloy task input. Review it before running providers, evaluation, or synthesis.');

  return {
    markdown: importedMarkdown,
    securityWarnings
  };
}

function resolveTaskOutputPath(rootDir, outputName, taskId) {
  const tasksDir = path.join(rootDir, 'samples', 'tasks');
  const requestedName = String(outputName || '').trim();
  const fallbackName = `${taskId}.task.md`;
  const baseName = path.basename(requestedName || fallbackName);
  const normalized = baseName.endsWith('.task.md')
    ? baseName
    : baseName.endsWith('.md')
      ? baseName.replace(/\.md$/i, '.task.md')
      : `${baseName}.task.md`;
  return path.join(tasksDir, normalized);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startServer();
}
