const provider = process.argv[2] || 'unknown';
const prompt = process.argv[3] || '';

console.error(`${provider}: starting`);
console.log(JSON.stringify({ type: 'session.started', provider }));
console.log(JSON.stringify({ type: 'prompt.length', provider, length: prompt.length }));
setTimeout(() => {
  console.error(`${provider}: finishing`);
  console.log(JSON.stringify({ type: 'session.completed', provider, summary: `${provider} complete` }));
  process.exit(0);
}, 20);
