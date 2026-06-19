import type { ComponentRegistry } from '@triggerix-ai/component'
import type { AIRegistry } from '@triggerix-ai/registry'
import type { JSONSchema } from '@triggerix-ai/schema'

/** Options accepted by `defineFunctionCalling`. */
export interface DefineFunctionCallingOptions {
  /** Registry of AI-aware events, actions, conditions. */
  registry: AIRegistry
  /** When provided, switches to component-generation mode. */
  component?: ComponentRegistry
  /** Override the tool name. Defaults to `'generate_triggerix_output'`. */
  toolName?: string
  /** Override the tool description (defaults to a generic explanation). */
  toolDescription?: string
}

/**
 * A tool definition in OpenAI-compatible format.
 * Compatible with OpenAI, Anthropic (with light adaptation), and most LLM SDKs.
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

/** Result of `defineFunctionCalling`. */
export interface FunctionCallingResult {
  /** Complete system prompt (protocol spec + dynamic registry content). */
  systemPrompt: string
  /** Tool definitions ready to pass to the LLM. */
  tools: ToolDefinition[]
}
