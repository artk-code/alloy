import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runAcceptanceChecks({ workspacePath, commands, outputDir }) {
  const verificationDir = path.join(outputDir, 'verification');
  await fs.mkdir(verificationDir, { recursive: true });

  const checks = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const result = await runOneCheck({
      workspacePath,
      command,
      outputDir: verificationDir,
      index
    });
    checks.push(result);
    if (result.status !== 'pass') {
      break;
    }
  }

  return {
    status: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail',
    checks
  };
}

async function runOneCheck({ workspacePath, command, outputDir, index }) {
  const slug = command
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || `check-${index + 1}`;
  const stdoutPath = path.join(outputDir, `${index + 1}-${slug}.stdout.log`);
  const stderrPath = path.join(outputDir, `${index + 1}-${slug}.stderr.log`);
  const stdoutHandle = await fs.open(stdoutPath, 'w');
  const stderrHandle = await fs.open(stderrPath, 'w');

  try {
    const child = spawn(command, {
      cwd: workspacePath,
      env: buildChildEnv(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const exitPromise = waitForExit(child);
    const exit = await Promise.all([
      pumpStream(child.stdout, stdoutHandle),
      pumpStream(child.stderr, stderrHandle),
      exitPromise
    ]).then(([, , value]) => value);
    return {
      command,
      status: exit.code === 0 ? 'pass' : 'fail',
      exit_code: exit.code,
      signal: exit.signal,
      stdout_path: stdoutPath,
      stderr_path: stderrPath
    };
  } finally {
    await stdoutHandle.close();
    await stderrHandle.close();
  }
}

async function pumpStream(stream, fileHandle) {
  if (!stream) {
    return;
  }
  for await (const chunk of stream) {
    await fileHandle.appendFile(chunk);
  }
}

function waitForExit(child) {
  if (!child.__alloyExitPromise) {
    child.__alloyExitPromise = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  }
  return child.__alloyExitPromise;
}

function buildChildEnv() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_NAME_PATTERN;
  delete env.NODE_TEST_ONLY;
  return env;
}
