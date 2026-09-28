import { config } from '../../config';
import type { ProviderName } from '../../domain/constants';
import { AppError } from '../../domain/errors';
import { AnthropicProvider } from './anthropic';
import { OpenAiProvider } from './openai';
import type { LLMProvider } from './types';

/** Para adicionar um provedor: implemente LLMProvider e registre aqui. */
export function createProvider(name: ProviderName): LLMProvider {
  if (name === 'anthropic') {
    if (!config.anthropicApiKey) throw new AppError('ANTHROPIC_API_KEY não configurada no .env.', 400);
    return new AnthropicProvider(config.anthropicApiKey);
  }
  if (!config.openaiApiKey) throw new AppError('OPENAI_API_KEY não configurada no .env.', 400);
  return new OpenAiProvider(config.openaiApiKey);
}

export function providerStatus(): Record<ProviderName, boolean> {
  return { anthropic: Boolean(config.anthropicApiKey), openai: Boolean(config.openaiApiKey) };
}
