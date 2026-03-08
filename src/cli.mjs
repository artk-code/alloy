import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { prepareTaskFromFile, runTaskFromPrepared } from './orchestrator.mjs';
import { doctorProviders, getProviderLoginCommand, listSupportedProviders } from './providers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);
  const command = normalizeCommand(args[0]);

  if (command === 'help' || !command) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === 'doctor') {
    const report = await doctorProviders();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'login') {
    const provider = args[1];
    if (!provider) {
      printUsage();
      process.exit(1);
    }
    await launchLogin(provider);
    return;
  }

  const taskArgIndex = command === 'prepare' || command === 'run' ? 1 : 0;
  const inputPath = args[taskArgIndex];
  if (!inputPath) {
    printUsage();
    process.exit(1);
  }

  const options = parseFlags(args.slice(taskArgIndex + 1));
  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  const preparedTask = await prepareTaskFromFile({ projectRoot, taskFilePath: absoluteInputPath })
    .catch((error) => {
      if (error.details) {
        console.error('Task brief validation failed.');
        console.error(JSON.stringify(error.details, null, 2));
        process.exit(1);
      }
      throw error;
    });

  if (command === 'prepare') {
    console.log(JSON.stringify(preparedTask.output, null, 2));
    return;
  }

  const runResult = await runTaskFromPrepared({
    task: preparedTask.task,
    packets: preparedTask.packets,
    prepared: preparedTask.prepared,
    dryRun: options.dryRun,
    maxTurns: options.maxTurns
  });

  console.log(JSON.stringify(runResult, null, 2));
}

function normalizeCommand(arg) {
  if (!arg) {
    return null;
  }
  if (arg.endsWith('.md')) {
    return 'prepare';
  }
  if (['prepare', 'run', 'doctor', 'login', 'help'].includes(arg)) {
    return arg;
  }
  return null;
}

function parseFlags(flags) {
  const options = {
    dryRun: false,
    maxTurns: 24
  };

  for (const flag of flags) {
    if (flag === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (flag.startsWith('--max-turns=')) {
      options.maxTurns = Number.parseInt(flag.split('=')[1], 10);
    }
  }

  return options;
}

function printUsage() {
  console.error([
    'Usage:',
    '  node src/cli.mjs prepare <task-brief.md>',
    '  node src/cli.mjs run <task-brief.md> [--dry-run] [--max-turns=24]',
    '  node src/cli.mjs doctor',
    `  node src/cli.mjs login <provider>  # providers: ${listSupportedProviders().join(', ')}`,
    '',
    'Legacy shortcut:',
    '  node src/cli.mjs <task-brief.md>'
  ].join('\n'));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

async function launchLogin(provider) {
  const login = getProviderLoginCommand(provider);
  const [binary, ...args] = login.command;
  console.error(`Launching interactive login for ${login.displayName}.`);
  for (const line of login.instructions) {
    console.error(`- ${line}`);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${provider} login command exited with code ${code}`));
      }
    });
  });
}
