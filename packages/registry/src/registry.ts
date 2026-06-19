import type { AIActionDef, AIConditionDef, AIEventDef } from './types'
import { BaseRegistry } from '@triggerix/registry'

/**
 * AI-enhanced registry. Inherits the type-safe event/action/condition storage
 * from BaseRegistry while adding awareness of AI-facing metadata.
 */
export class AIRegistry extends BaseRegistry<AIEventDef, AIActionDef, AIConditionDef> {}
