import os from 'node:os';

export function buildTerminalLoginLaunch({ projectRoot, provider }) {
  const loginCommand = `cd ${shellQuote(projectRoot)} && node src/cli.mjs login ${shellQuote(provider)}`;
  const platform = os.platform();

  if (platform === 'darwin') {
    return {
      platform,
      supported: true,
      launcher: 'osascript',
      args: [
        '-e',
        `tell application "Terminal" to do script ${appleScriptString(loginCommand)}`,
        '-e',
        'tell application "Terminal" to activate'
      ],
      human_command: loginCommand
    };
  }

  if (platform === 'linux') {
    return {
      platform,
      supported: true,
      launcher: 'sh',
      args: ['-lc', `x-terminal-emulator -e ${shellQuote(loginCommand)}`],
      human_command: loginCommand
    };
  }

  return {
    platform,
    supported: false,
    launcher: null,
    args: [],
    human_command: loginCommand
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
