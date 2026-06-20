/**
 * Public types for `@triggerix-ai/fn`.
 *
 * These types are the **only contract** between the library and its callers.
 * They contain no triggerix-specific concepts — every field here is general
 * enough to be used by any LLM tool-calling application (food ordering,
 * customer support, IDE tooling, etc.).
 */

/** Primitive JSON Schema type strings. */
export type JSONSchemaType
  = | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null'

/**
 * A user-friendly declaration of a single tool parameter.
 * Converted internally to a JSON Schema (draft-07 subset) by `paramToJSONSchema`.
 */
export interface ToolParamDef {
  type: JSONSchemaType
  /** Human-readable description surfaced to the LLM. */
  description?: string
  /** Constrain the value to a fixed set. */
  enum?: ReadonlyArray<string | number | boolean>
  /** Mark as required in the generated JSON Schema. */
  required?: boolean
  /** Default value (informational; not auto-applied). */
  default?: string | number | boolean | null
  /** For `type: 'array'`: shape of each element. */
  items?: ToolParamDef
  /** For `type: 'object'`: nested property shapes. */
  properties?: Record<string, ToolParamDef>
  /** For `type: 'object'`: explicit list of required property names. */
  requiredProps?: string[]
}

/** A single tool the LLM can call. */
export interface ToolDef {
  /** Tool name. Use flat lowercase + underscores (e.g. `update_nickname`). */
  name: string
  /** Human-readable description; the LLM uses this to decide when to call. */
  description: string
  /**
   * Parameter schema, keyed by parameter name.
   * Empty object `{}` means "no parameters".
   */
  params: Record<string, ToolParamDef>
  /**
   * Hint to the LLM that this tool is safe to call in parallel with other
   * `parallel: true` tools in the same response. The LLM is not forced to obey.
   */
  parallel?: boolean
}

/** OpenAI-compatible tool definition (also accepted by Anthropic and most SDKs). */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

/**
 * Subset of JSON Schema (draft-07) sufficient for LLM tool definitions.
 * Mirrors the output of `paramToJSONSchema`; not meant to be authored by hand.
 */
export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[]
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: ReadonlyArray<unknown>
  additionalProperties?: boolean
  oneOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  const?: unknown
  default?: unknown
  $ref?: string
  $defs?: Record<string, JSONSchema>
  definitions?: Record<string, JSONSchema>
}

/** Options for `defineTools`. */
export interface DefineToolsInput {
  /**
   * The list of tools the LLM may call. Order is preserved; LLM-friendly
   * ordering (most important tools first) is the caller's responsibility.
   */
  tools: ReadonlyArray<ToolDef>
  /**
   * Business-specific system prompt. The library will prepend a small
   * generic tool-calling protocol so the LLM understands how to use the tools.
   */
  systemPrompt?: string
  /**
   * Tool selection policy passed to the LLM API.
   *  - `'auto'`: LLM decides whether to call a tool
   *  - `'required'`: LLM must call at least one tool
   *  - `'none'`: LLM must not call any tool
   * Default: `'auto'`.
   */
  toolChoice?: 'auto' | 'required' | 'none'
}

/** Output of `defineTools`. */
export interface DefineToolsResult {
  /** Final system prompt = generic protocol + caller-supplied sections. */
  systemPrompt: string
  /** OpenAI-compatible tool definitions, ready to pass to the LLM API. */
  tools: ToolDefinition[]
  /** Echo of the chosen tool choice (caller can pass this to the API). */
  toolChoice: 'auto' | 'required' | 'none'
}
