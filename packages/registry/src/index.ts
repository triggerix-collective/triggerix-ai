import { AIRegistry } from './registry'

export { AIRegistry } from './registry'
export type { AIActionDef, AIConditionDef, AIEventDef, ParamSchema } from './types'
export { defineAIAction, defineAICondition, defineAIEvent } from './types'

/**
 * Factory for AIRegistry. Prefer this over `new AIRegistry()` for consistency
 * with other ecosystem packages.
 */
export function createAIRegistry(): AIRegistry {
  return new AIRegistry()
}
