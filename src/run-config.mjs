import { DEFAULT_PROVIDER_SPECS } from './providers.mjs';

const DEFAULT_PROFILE_ID = 'default';
const MAX_AGENT_COUNT = 4;

export function buildDefaultRunConfig(task, { specs = DEFAULT_PROVIDER_SPECS } = {}) {
  const providers = (task.providers || [])
    .filter((provider) => specs[provider])
    .map((provider) => {
      const spec = specs[provider];
      const runtime = spec.runtime || {};
      return {
        provider,
        label: spec.displayName,
        enabled: true,
        agents: 1,
        profile_id: DEFAULT_PROFILE_ID,
        transport: runtime.runTransport || 'pipe',
        login_transport: runtime.loginTransport || 'pty',
        supports_noninteractive: runtime.supportsNonInteractive !== false,
        supports_json_stream: runtime.supportsJsonStream !== false,
        auth_observable: runtime.authObservable === true
      };
    });

  return {
    mode: task.mode,
    judge: task.judge,
    max_parallel_candidates: providers.reduce((count, provider) => count + provider.agents, 0),
    providers
  };
}

export function normalizeRunConfig(task, runConfig, { specs = DEFAULT_PROVIDER_SPECS } = {}) {
  const fallback = buildDefaultRunConfig(task, { specs });
  if (!runConfig) {
    return fallback;
  }

  const inputProviders = Array.isArray(runConfig.providers) ? runConfig.providers : [];
  const mergedProviders = fallback.providers.map((providerConfig) => {
    const override = inputProviders.find((entry) => entry.provider === providerConfig.provider) || {};
    return {
      ...providerConfig,
      enabled: override.enabled === undefined ? providerConfig.enabled : Boolean(override.enabled),
      agents: clampAgentCount(override.agents ?? providerConfig.agents),
      profile_id: cleanString(override.profile_id) || providerConfig.profile_id,
      transport: resolveTransport({
        requested: cleanString(override.transport),
        fallback: providerConfig.transport,
        specs,
        provider: providerConfig.provider
      })
    };
  });

  const enabledProviders = mergedProviders.filter((provider) => provider.enabled && provider.agents > 0);
  if (enabledProviders.length === 0) {
    throw new Error('Run config must enable at least one provider.');
  }

  const judge = cleanString(runConfig.judge) || fallback.judge;
  const maxParallelCandidates = Number.parseInt(runConfig.max_parallel_candidates, 10);

  return {
    mode: cleanString(runConfig.mode) || fallback.mode,
    judge,
    max_parallel_candidates: Number.isFinite(maxParallelCandidates) && maxParallelCandidates > 0
      ? maxParallelCandidates
      : enabledProviders.reduce((count, provider) => count + provider.agents, 0),
    providers: mergedProviders
  };
}

export function expandRunConfig(task, runConfig) {
  const providers = runConfig.providers.filter((provider) => provider.enabled && provider.agents > 0);
  const expanded = [];

  for (const providerConfig of providers) {
    for (let agentIndex = 1; agentIndex <= providerConfig.agents; agentIndex += 1) {
      expanded.push({
        provider: providerConfig.provider,
        agent_index: agentIndex,
        provider_instance_id: `${providerConfig.provider}-${agentIndex}`,
        profile_id: providerConfig.profile_id,
        transport: providerConfig.transport,
        judge: task.judge
      });
    }
  }

  return expanded;
}

function clampAgentCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, MAX_AGENT_COUNT);
}

function resolveTransport({ requested, fallback, specs, provider }) {
  if (!requested) {
    return fallback;
  }

  const runtime = specs[provider]?.runtime || {};
  const supported = new Set(runtime.supportedRunTransports || [fallback]);
  return supported.has(requested) ? requested : fallback;
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}
