import { config } from '../config.js';

/**
 * Shape accepted by Mastra's `Agent({ model })` for an OpenAI-compatible
 * provider. Mastra v1 resolves this "OpenAI-compatible" config object into a
 * concrete language model at runtime, so we pass the provider id, model id,
 * API key and base URL straight through from env vars. DeepSeek (and any other
 * OpenAI-compatible endpoint) is fully pluggable by swapping these values.
 *
 * This mirrors Mastra's `OpenAICompatibleConfig`
 * (`{ providerId, modelId, url?, apiKey? }`) member of `MastraModelConfig`.
 */
export interface LlmModelConfig {
  providerId: string;
  modelId: string;
  apiKey: string;
  url: string;
}

/** Build the model config object from environment-driven settings. */
export function llmModelConfig(): LlmModelConfig {
  return {
    providerId: config.llm.provider,
    modelId: config.llm.model,
    apiKey: config.llm.apiKey,
    url: config.llm.baseUrl,
  };
}
