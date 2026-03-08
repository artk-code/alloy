import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_PROVIDER_SPECS = {
  codex: {
    provider: 'codex',
    displayName: 'Codex',
    binary: 'codex',
    versionArgs: ['--version'],
    eventFormat: 'jsonl',
    docs: 'https://developers.openai.com/codex/cli',
    runtime: {
      loginTransport: 'pty',
      runTransport: 'pipe',
      supportedRunTransports: ['pipe', 'pty'],
      supportsJsonStream: true,
      supportsNonInteractive: true,
      authObservable: true,
      profiles: [{ id: 'default', label: 'Default' }]
    },
    auth: {
      status: 'unknown',
      flow: 'interactive-browser',
      loginCommand: ['codex'],
      testCommand: ['codex', 'login', 'status'],
      instructions: [
        'Launch Codex in an interactive terminal session.',
        'If not already signed in, select Sign in with ChatGPT.',
        'Complete the browser-based HTTPS login flow.'
      ],
      testInstructions: [
        'Run the official Codex login status command in a terminal.',
        'If the terminal prints "Logged in using ChatGPT", the current profile is ready for Alloy.'
      ],
      probe: probeCodexAuth
    },
    buildArgs({ prompt, maxTurns = 24, model = null }) {
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '--full-auto',
        '--max-turns',
        String(maxTurns)
      ];
      if (model) {
        args.push('--model', model);
      }
      args.push(prompt);
      return args;
    }
  },
  'claude-code': {
    provider: 'claude-code',
    displayName: 'Claude Code',
    binary: 'claude',
    versionArgs: ['--version'],
    eventFormat: 'stream-json',
    docs: 'https://code.claude.com/docs/en/quickstart',
    runtime: {
      loginTransport: 'pty',
      runTransport: 'pipe',
      supportedRunTransports: ['pipe', 'pty'],
      supportsJsonStream: true,
      supportsNonInteractive: true,
      authObservable: true,
      profiles: [{ id: 'default', label: 'Default' }]
    },
    auth: {
      status: 'unknown',
      flow: 'interactive-browser',
      loginCommand: ['claude'],
      testCommand: ['claude', 'auth', 'status'],
      instructions: [
        'Launch Claude Code in an interactive terminal session.',
        'If you are not signed in, run /login inside Claude Code.',
        'Complete the browser-based HTTPS login flow.'
      ],
      testInstructions: [
        'Run the official Claude Code auth status command in a terminal.',
        'If the JSON output shows loggedIn true, the current profile is ready for Alloy.'
      ],
      probe: probeClaudeAuth
    },
    buildArgs({ prompt, maxTurns = 24, model = null, permissionMode = 'skip' }) {
      const args = [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--max-turns',
        String(maxTurns)
      ];
      if (permissionMode === 'skip') {
        args.push('--dangerously-skip-permissions');
      }
      if (model) {
        args.push('--model', model);
      }
      return args;
    }
  },
  gemini: {
    provider: 'gemini',
    displayName: 'Gemini CLI',
    binary: 'gemini',
    versionArgs: ['--version'],
    eventFormat: 'stream-json',
    docs: 'https://github.com/google-gemini/gemini-cli',
    runtime: {
      loginTransport: 'pty',
      runTransport: 'pipe',
      supportedRunTransports: ['pipe', 'pty'],
      supportsJsonStream: true,
      supportsNonInteractive: true,
      authObservable: false,
      profiles: [{ id: 'default', label: 'Default' }]
    },
    auth: {
      status: 'manual_check',
      flow: 'interactive-browser',
      loginCommand: ['gemini'],
      testCommand: ['gemini'],
      instructions: [
        'Launch Gemini CLI in an interactive terminal session.',
        'Choose Login with Google when prompted.',
        'Complete the browser-based HTTPS login flow.'
      ],
      testInstructions: [
        'Launch Gemini CLI interactively.',
        'If Gemini opens directly into a working prompt, auth is likely fine.',
        'If it asks you to log in or configure auth, complete that flow and rerun the test.'
      ],
      probe: probeGeminiAuth
    },
    buildArgs({ prompt, model = null }) {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (model) {
        args.push('--model', model);
      }
      return args;
    }
  }
};

export function listSupportedProviders() {
  return Object.keys(DEFAULT_PROVIDER_SPECS);
}

export function getProviderSpec(provider, specs = DEFAULT_PROVIDER_SPECS) {
  const spec = specs[provider];
  if (!spec) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return spec;
}

export function buildProviderCommand({ provider, prompt, options = {}, specs = DEFAULT_PROVIDER_SPECS }) {
  const spec = getProviderSpec(provider, specs);
  return {
    provider,
    displayName: spec.displayName,
    binary: spec.binary,
    args: spec.buildArgs({ prompt, ...options }),
    eventFormat: spec.eventFormat,
    docs: spec.docs
  };
}

export async function doctorProviders({ specs = DEFAULT_PROVIDER_SPECS, timeoutMs = 4000 } = {}) {
  const env = buildProviderEnv(process.env);
  const providers = Object.keys(specs);
  const results = await Promise.all(providers.map(async (provider) => {
    const spec = getProviderSpec(provider, specs);
    try {
      const { stdout, stderr } = await execFileAsync(spec.binary, spec.versionArgs, { timeout: timeoutMs, env });
      const version = normalizeVersionOutput(`${stdout || ''}${stderr || ''}`);
      const auth = await runAuthProbe({ provider, spec, timeoutMs, env });
      return {
        provider,
        display_name: spec.displayName,
        binary: spec.binary,
        installed: true,
        auth_status: auth.status,
        auth_detail: auth.detail,
        auth_flow: spec.auth?.flow || 'unknown',
        auth_observable: auth.observable ?? (spec.runtime?.authObservable === true),
        auth_source: auth.source || 'default',
        auth_checked_at: auth.checked_at,
        login_command: spec.auth?.loginCommand || null,
        login_instructions: spec.auth?.instructions || [],
        default_transport: spec.runtime?.runTransport || 'pipe',
        login_transport: spec.runtime?.loginTransport || 'pty',
        supported_run_transports: spec.runtime?.supportedRunTransports || [spec.runtime?.runTransport || 'pipe'],
        supports_noninteractive: spec.runtime?.supportsNonInteractive !== false,
        supports_json_stream: spec.runtime?.supportsJsonStream !== false,
        profiles: spec.runtime?.profiles || [{ id: 'default', label: 'Default' }],
        version: version || null,
        docs: spec.docs
      };
    } catch (error) {
      return {
        provider,
        display_name: spec.displayName,
        binary: spec.binary,
        installed: false,
        auth_status: spec.auth?.status || 'unknown',
        auth_detail: spec.auth?.probe ? 'Provider binary is not installed, so auth could not be checked.' : 'Provider auth probe is unavailable.',
        auth_flow: spec.auth?.flow || 'unknown',
        auth_observable: spec.runtime?.authObservable === true,
        auth_source: spec.auth?.probe ? 'probe-unavailable' : 'default',
        auth_checked_at: new Date().toISOString(),
        login_command: spec.auth?.loginCommand || null,
        login_instructions: spec.auth?.instructions || [],
        default_transport: spec.runtime?.runTransport || 'pipe',
        login_transport: spec.runtime?.loginTransport || 'pty',
        supported_run_transports: spec.runtime?.supportedRunTransports || [spec.runtime?.runTransport || 'pipe'],
        supports_noninteractive: spec.runtime?.supportsNonInteractive !== false,
        supports_json_stream: spec.runtime?.supportsJsonStream !== false,
        profiles: spec.runtime?.profiles || [{ id: 'default', label: 'Default' }],
        version: null,
        docs: spec.docs,
        error: error.code === 'ENOENT' ? 'binary_not_found' : (error.message || String(error))
      };
    }
  }));

  return {
    providers: results,
    all_installed: results.every((result) => result.installed)
  };
}

function normalizeVersionOutput(output) {
  const lines = String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] || null;
}

export function buildProviderEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    PATH: sanitizeProviderPath(baseEnv.PATH || '')
  };
}

async function runAuthProbe({ provider, spec, timeoutMs, env }) {
  if (typeof spec.auth?.probe !== 'function') {
    return {
      status: spec.auth?.status || 'unknown',
      detail: 'This provider does not expose a reliable auth probe in Alloy yet. Verify login in the CLI session manually.',
      source: 'default',
      checked_at: new Date().toISOString(),
      observable: spec.runtime?.authObservable === true
    };
  }

  try {
    const result = await spec.auth.probe({ provider, spec, timeoutMs, env });
    return {
      status: result?.status || spec.auth?.status || 'unknown',
      detail: result?.detail || 'Auth probe completed without a detailed message.',
      source: result?.source || 'probe',
      checked_at: new Date().toISOString(),
      observable: result?.observable ?? (spec.runtime?.authObservable === true)
    };
  } catch (error) {
    return {
      status: 'unknown',
      detail: error.message || String(error),
      source: 'probe_error',
      checked_at: new Date().toISOString(),
      observable: false
    };
  }
}

async function probeCodexAuth({ spec, timeoutMs, env }) {
  try {
    const output = await captureProbeOutput(spec.binary, ['login', 'status'], timeoutMs, env);
    return resolveCodexAuth(output);
  } catch (error) {
    return resolveCodexAuth(extractExecOutput(error));
  }
}

async function probeClaudeAuth({ spec, timeoutMs, env }) {
  try {
    const output = await captureProbeOutput(spec.binary, ['auth', 'status'], timeoutMs, env);
    return resolveClaudeAuth(output);
  } catch (error) {
    return resolveClaudeAuth(extractExecOutput(error));
  }
}

async function probeGeminiAuth() {
  const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
  try {
    await fs.access(settingsPath);
    return {
      status: 'manual_check',
      detail: 'Gemini CLI does not expose a safe auth status check here. Verify login in the CLI session manually with Test Auth.',
      source: 'manual-check',
      observable: false
    };
  } catch {
    return {
      status: 'manual_check',
      detail: 'Verify Gemini login in the CLI session manually from the Test Auth button.',
      source: 'manual-check',
      observable: false
    };
  }
}

async function captureProbeOutput(binary, args, timeoutMs, env) {
  const { stdout, stderr } = await execFileAsync(binary, args, { timeout: timeoutMs, env });
  return `${stdout || ''}${stderr || ''}`.trim();
}

function extractExecOutput(error) {
  return `${error?.stdout || ''}${error?.stderr || ''}${error?.message || ''}`.trim();
}

function normalizeProbeOutput(output) {
  const lines = String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('WARNING:'))
    .filter((line) => !line.startsWith('(node:'))
    .filter((line) => !line.startsWith('(Use '));
  return lines.join('\n');
}

function extractJsonObject(output) {
  const text = String(output);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('json_object_not_found');
  }
  return text.slice(start, end + 1);
}

function resolveCodexAuth(output) {
  const normalized = normalizeProbeOutput(output);
  if (/logged in/i.test(normalized)) {
    return {
      status: 'valid',
      detail: normalized || 'Logged in using ChatGPT.',
      source: 'codex-login-status',
      observable: true
    };
  }
  if (/not logged in|logged out|login required/i.test(normalized)) {
    return {
      status: 'invalid',
      detail: normalized || 'Codex reports that no ChatGPT login is active.',
      source: 'codex-login-status',
      observable: true
    };
  }
  return {
    status: 'unknown',
    detail: normalized || 'Codex auth probe returned an unrecognized status.',
    source: 'codex-login-status',
    observable: true
  };
}

function resolveClaudeAuth(output) {
  try {
    const payload = JSON.parse(extractJsonObject(output));
    return {
      status: payload.loggedIn ? 'valid' : 'invalid',
      detail: payload.loggedIn
        ? `Claude Code reports ${payload.authMethod || 'account'} authentication is active.`
        : 'Claude Code reports no active authentication.',
      source: 'claude-auth-status',
      observable: true
    };
  } catch {
    const normalized = normalizeProbeOutput(output);
    return {
      status: 'unknown',
      detail: normalized || 'Claude Code auth probe failed unexpectedly.',
      source: 'claude-auth-status',
      observable: true
    };
  }
}

function sanitizeProviderPath(pathValue) {
  const delimiter = os.platform() === 'win32' ? ';' : ':';
  return String(pathValue)
    .split(delimiter)
    .filter(Boolean)
    .filter((segment) => !segment.endsWith(`${path.sep}node_modules${path.sep}.bin`))
    .join(delimiter);
}

export function getProviderLoginCommand(provider, specs = DEFAULT_PROVIDER_SPECS) {
  const spec = getProviderSpec(provider, specs);
  if (!spec.auth?.loginCommand?.length) {
    throw new Error(`Provider ${provider} does not define a login command.`);
  }
  return {
    provider,
    displayName: spec.displayName,
    command: spec.auth.loginCommand,
    instructions: spec.auth.instructions || [],
    flow: spec.auth.flow || 'unknown'
  };
}

export function getProviderTestCommand(provider, specs = DEFAULT_PROVIDER_SPECS) {
  const spec = getProviderSpec(provider, specs);
  const command = spec.auth?.testCommand || spec.auth?.loginCommand;
  if (!command?.length) {
    throw new Error(`Provider ${provider} does not define a test command.`);
  }
  return {
    provider,
    displayName: spec.displayName,
    command,
    instructions: spec.auth?.testInstructions || spec.auth?.instructions || [],
    flow: spec.auth?.flow || 'unknown'
  };
}
