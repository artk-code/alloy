import os from 'node:os';

export function buildTerminalLoginLaunch({ projectRoot, provider }) {
  const loginCommand = `cd ${shellQuote(projectRoot)} && node src/cli.mjs login ${shellQuote(provider)}`;
  return buildTerminalCommandLaunch({ command: loginCommand });
}

export function buildTerminalCommandLaunch({ command }) {
  const platform = os.platform();

  if (platform === 'darwin') {
    return {
      platform,
      supported: true,
      launcher: 'osascript',
      args: [
        '-e',
        `tell application "Terminal" to do script ${appleScriptString(command)}`,
        '-e',
        'tell application "Terminal" to activate'
      ],
      human_command: command
    };
  }

  if (platform === 'linux') {
    return {
      platform,
      supported: true,
      launcher: 'sh',
      args: ['-lc', `x-terminal-emulator -e ${shellQuote(command)}`],
      human_command: command
    };
  }

  return {
    platform,
    supported: false,
    launcher: null,
    args: [],
    human_command: command
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
