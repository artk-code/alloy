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
    auth: {
      status: 'unknown',
      flow: 'interactive-browser',
      loginCommand: ['codex'],
      instructions: [
        'Launch Codex in an interactive terminal session.',
        'If not already signed in, select Sign in with ChatGPT.',
        'Complete the browser-based HTTPS login flow.'
      ]
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
    auth: {
      status: 'unknown',
      flow: 'interactive-browser',
      loginCommand: ['claude'],
      instructions: [
        'Launch Claude Code in an interactive terminal session.',
        'If you are not signed in, run /login inside Claude Code.',
        'Complete the browser-based HTTPS login flow.'
      ]
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
    auth: {
      status: 'unknown',
      flow: 'interactive-browser',
      loginCommand: ['gemini'],
      instructions: [
        'Launch Gemini CLI in an interactive terminal session.',
        'Choose Login with Google when prompted.',
        'Complete the browser-based HTTPS login flow.'
      ]
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
  const providers = Object.keys(specs);
  const results = await Promise.all(providers.map(async (provider) => {
    const spec = getProviderSpec(provider, specs);
    try {
      const { stdout, stderr } = await execFileAsync(spec.binary, spec.versionArgs, { timeout: timeoutMs });
      const version = `${stdout || ''}${stderr || ''}`.trim();
      return {
        provider,
        display_name: spec.displayName,
        binary: spec.binary,
        installed: true,
        auth_status: spec.auth?.status || 'unknown',
        auth_flow: spec.auth?.flow || 'unknown',
        login_command: spec.auth?.loginCommand || null,
        login_instructions: spec.auth?.instructions || [],
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
        auth_flow: spec.auth?.flow || 'unknown',
        login_command: spec.auth?.loginCommand || null,
        login_instructions: spec.auth?.instructions || [],
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
