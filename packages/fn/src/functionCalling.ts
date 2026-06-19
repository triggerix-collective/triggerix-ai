import type { ComponentRegistry } from '@triggerix-ai/component'
import type { AIRegistry } from '@triggerix-ai/registry'
import type {
  DefineFunctionCallingOptions,
  FunctionCallingResult,
  ToolDefinition
} from './types'
import { generateSystemPrompt } from '@triggerix-ai/prompt'
import { generateToolSchema } from '@triggerix-ai/schema'

const COMPONENT_MODE_DESCRIPTION = `Generate Triggerix interactive output. Call this tool to produce a complete UI bundle: a list of atomic components to render, plus a list of triggers that bind user interactions to backend actions. The output schema constrains event types, action types, and component types to those registered by the developer.`

const TRIGGER_ONLY_DESCRIPTION = `Generate Triggerix triggers. Call this tool to produce a list of triggers that bind events to actions under given conditions. The output schema constrains event types and action types to those registered by the developer.`

/**
 * Build the complete `system` + `tools` payload for an LLM Function Calling call.
 *
 * Two output modes:
 *  - **Component-generation mode** (with `component`): the tool returns `{ components, triggers }`
 *  - **Trigger-only mode** (no `component`): the tool returns `{ triggers }` only
 */
export function defineFunctionCalling(options: DefineFunctionCallingOptions): FunctionCallingResult {
  const { registry, component } = options
  const toolName = options.toolName ?? 'generate_triggerix_output'
  const toolDescription = options.toolDescription ?? (component ? COMPONENT_MODE_DESCRIPTION : TRIGGER_ONLY_DESCRIPTION)

  const systemPrompt = generateSystemPrompt({ registry, component })
  const parameters = generateToolSchema({ registry, component })

  const tool: ToolDefinition = {
    type: 'function',
    function: {
      name: toolName,
      description: toolDescription,
      parameters
    }
  }

  return {
    systemPrompt,
    tools: [tool]
  }
}

/** Type re-export so callers can name the registry inputs cleanly. */
export type { AIRegistry, ComponentRegistry }
