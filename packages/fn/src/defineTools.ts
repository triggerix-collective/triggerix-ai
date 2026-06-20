import type { DefineToolsInput, DefineToolsResult, ToolDefinition } from './types'
import { BASE_TOOL_CALLING_PROTOCOL } from './baseProtocol'
import { buildToolParameters } from './paramToSchema'

/**
 * Build the complete Function Calling payload for an LLM API call.
 *
 * `defineTools` is the only public API of `@triggerix-ai/fn`. It:
 *  1. Prepends a generic tool-calling protocol to the caller-supplied system prompt
 *  2. Converts each `ToolDef` (business-friendly) into an OpenAI-compatible
 *     `ToolDefinition` (JSON Schema parameters)
 *  3. Returns the full payload + the chosen `toolChoice` for the caller to pass
 *     through to the LLM API
 *
 * The function is pure: it does not read registries, components, runtime state,
 * or any other library module. It contains no triggerix-specific concepts.
 */
export function defineTools(input: DefineToolsInput): DefineToolsResult {
  const { tools, systemPrompt = '', toolChoice = 'auto' } = input

  const sections: string[] = [BASE_TOOL_CALLING_PROTOCOL]
  if (systemPrompt.trim())
    sections.push(systemPrompt)
  const fullPrompt = sections.join('\n\n')

  const toolDefs: ToolDefinition[] = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: buildToolParameters(tool.params)
    }
  }))

  return {
    systemPrompt: fullPrompt,
    tools: toolDefs,
    toolChoice
  }
}
