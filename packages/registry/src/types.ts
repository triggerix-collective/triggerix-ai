/**
 * Schema description for a single parameter of an event/action/condition.
 * AI-friendly: only describes structure, not runtime behavior.
 */
export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object'
  description?: string
  enum?: unknown[]
  required?: boolean
  default?: unknown
}

/**
 * AI-aware event definition.
 * Extends BaseItemDef with metadata for LLM consumption.
 */
export interface AIEventDef {
  id: string
  label: string
  description: string
  prompt?: string
  params?: Record<string, ParamSchema>
}

/**
 * AI-aware action definition.
 */
export interface AIActionDef {
  id: string
  label: string
  description: string
  prompt?: string
  params?: Record<string, ParamSchema>
}

/**
 * AI-aware condition definition.
 */
export interface AIConditionDef {
  id: string
  label: string
  description: string
  prompt?: string
}

/**
 * Identity helper — preserves the input type as the output type.
 */
export function defineAIEvent(def: AIEventDef): AIEventDef {
  return def
}

export function defineAIAction(def: AIActionDef): AIActionDef {
  return def
}

export function defineAICondition(def: AIConditionDef): AIConditionDef {
  return def
}
