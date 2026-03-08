const provider = process.argv[2] || 'unknown';
const mode = process.argv[3] || 'noop';
const summary = process.argv[4] || `${provider} complete`;
const delayMs = Number.parseInt(process.argv[5] || '20', 10);

console.error(`${provider}: starting`);
console.log(JSON.stringify({ type: 'session.started', provider }));

setTimeout(() => {
  if (mode === 'fail') {
    console.error(`${provider}: failing`);
    console.log(JSON.stringify({ type: 'session.failed', provider, summary }));
    process.exit(1);
  }

  console.error(`${provider}: finishing`);
  console.log(JSON.stringify({ type: 'session.completed', provider, summary }));
  process.exit(0);
}, Number.isFinite(delayMs) ? delayMs : 20);
