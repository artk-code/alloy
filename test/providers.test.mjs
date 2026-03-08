import test from 'node:test';
import assert from 'node:assert/strict';

import { doctorProviders } from '../src/providers.mjs';

test('doctorProviders surfaces probe-backed auth status and detail when available', async () => {
  const specs = {
    codex: {
      provider: 'codex',
      displayName: 'Codex',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'jsonl',
      docs: 'https://example.test/codex',
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
        instructions: ['Sign in via browser.'],
        async probe() {
          return {
            status: 'valid',
            detail: 'Logged in using ChatGPT',
            source: 'codex-login-status',
            observable: true
          };
        }
      },
      buildArgs() {
        return [];
      }
    },
    gemini: {
      provider: 'gemini',
      displayName: 'Gemini CLI',
      binary: process.execPath,
      versionArgs: ['--version'],
      eventFormat: 'stream-json',
      docs: 'https://example.test/gemini',
      runtime: {
        loginTransport: 'pty',
        runTransport: 'pipe',
        supportedRunTransports: ['pipe'],
        supportsJsonStream: true,
        supportsNonInteractive: true,
        authObservable: false,
        profiles: [{ id: 'default', label: 'Default' }]
      },
      auth: {
        status: 'manual_check',
        flow: 'interactive-browser',
        loginCommand: ['gemini'],
        instructions: ['Sign in via browser.']
      },
      buildArgs() {
        return [];
      }
    }
  };

  const report = await doctorProviders({ specs });
  const codex = report.providers.find((provider) => provider.provider === 'codex');
  const gemini = report.providers.find((provider) => provider.provider === 'gemini');

  assert.equal(codex.installed, true);
  assert.equal(codex.auth_status, 'valid');
  assert.equal(codex.auth_detail, 'Logged in using ChatGPT');
  assert.equal(codex.auth_source, 'codex-login-status');
  assert.equal(codex.auth_observable, true);
  assert.match(codex.auth_checked_at, /\d{4}-\d{2}-\d{2}T/);

  assert.equal(gemini.installed, true);
  assert.equal(gemini.auth_status, 'manual_check');
  assert.match(gemini.auth_detail, /verify login in the cli session manually/i);
  assert.equal(gemini.auth_source, 'default');
});
