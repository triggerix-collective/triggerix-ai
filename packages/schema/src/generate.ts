import type { AIComponentDef, ComponentRegistry } from '@triggerix-ai/component'
import type { AIActionDef, AIEventDef, AIRegistry, ParamSchema } from '@triggerix-ai/registry'
import type { JSONSchema } from './types'
import {
  CONDITION_GROUP_TYPES,
  VALID_OPERATORS
} from '@triggerix/core'

// ============================================================================
// Pure constants — no registry dependency. Shared across every generate call
// so repeated schema generation (e.g. on every component re-registration in
// streaming UIs) avoids redundant object allocation.
// ============================================================================

/** JSON Schema for a Value (Literal | Reference). */
const VALUE_SCHEMA: JSONSchema = {
  oneOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
    {
      type: 'object',
      properties: { $ref: { type: 'string' } },
      required: ['$ref'],
      additionalProperties: false
    }
  ]
}

/** JSON Schema for a Condition (single comparison). */
const CONDITION_SCHEMA: JSONSchema = {
  type: 'object',
  title: 'Condition',
  description: 'A single comparison condition',
  properties: {
    left: VALUE_SCHEMA,
    operator: { type: 'string', enum: [...VALID_OPERATORS] },
    right: VALUE_SCHEMA
  },
  required: ['left', 'operator'],
  additionalProperties: false
}

/** JSON Schema for a ConditionGroup (AND / OR only — `not` is intentionally excluded). */
const CONDITION_GROUP_SCHEMA: JSONSchema = {
  type: 'object',
  title: 'ConditionGroup',
  description: 'Logical grouping of conditions (AND / OR)',
  properties: {
    type: { type: 'string', enum: [...CONDITION_GROUP_TYPES] },
    conditions: {
      type: 'array',
      items: { $ref: '#/definitions/ConditionItem' },
      minItems: 1
    }
  },
  required: ['type', 'conditions'],
  additionalProperties: false
}

/**
 * JSON Schema for a single ConditionItem — used as the array element type of
 * the flat `conditions` array (implicit AND with explicit nested groups).
 */
const CONDITION_ITEM_SCHEMA: JSONSchema = {
  oneOf: [
    { $ref: '#/definitions/Condition' },
    { $ref: '#/definitions/ConditionGroup' }
  ]
}

const ACTION_NODE_REF: JSONSchema = { $ref: '#/definitions/ActionNode' }
const ACTION_ARRAY: JSONSchema = { type: 'array', items: ACTION_NODE_REF }

/** Flow control node definitions (sequence / parallel / if / tryCatch). */
const FLOW_DEFINITIONS: Record<string, JSONSchema> = {
  Sequence: {
    type: 'object',
    properties: {
      type: { const: 'sequence' },
      actions: { ...ACTION_ARRAY, minItems: 1 }
    },
    required: ['type', 'actions'],
    additionalProperties: false
  },
  Parallel: {
    type: 'object',
    properties: {
      type: { const: 'parallel' },
      actions: { ...ACTION_ARRAY, minItems: 1 }
    },
    required: ['type', 'actions'],
    additionalProperties: false
  },
  If: {
    type: 'object',
    properties: {
      type: { const: 'if' },
      condition: {
        type: 'array',
        items: { $ref: '#/definitions/ConditionItem' }
      },
      then: { ...ACTION_ARRAY, minItems: 1 },
      else: ACTION_ARRAY
    },
    required: ['type', 'condition', 'then'],
    additionalProperties: false
  },
  TryCatch: {
    type: 'object',
    properties: {
      type: { const: 'tryCatch' },
      try: { ...ACTION_ARRAY, minItems: 1 },
      catch: ACTION_ARRAY,
      finally: ACTION_ARRAY
    },
    required: ['type', 'try'],
    additionalProperties: false
  }
}

// ============================================================================
// Registry-dependent helpers
// ============================================================================

/** Map a ParamSchema entry to its JSON Schema representation. */
function paramToSchema(param: ParamSchema): JSONSchema {
  const schema: JSONSchema = { type: param.type }
  if (param.description !== undefined)
    schema.description = param.description
  if (param.enum !== undefined)
    schema.enum = param.enum
  if (param.default !== undefined)
    schema.default = param.default
  return schema
}

/** Build a JSON Schema for a set of registered event IDs. */
function eventTypeEnum(events: AIEventDef[]): JSONSchema {
  return {
    type: 'string',
    enum: events.map(e => e.id),
    description: 'Must match an event type registered via AIRegistry'
  }
}

/** Build a JSON Schema for a set of registered action IDs. */
function actionTypeEnum(actions: AIActionDef[]): JSONSchema {
  return {
    type: 'string',
    enum: actions.map(a => a.id),
    description: 'Must match an action type registered via AIRegistry'
  }
}

/** Build a JSON Schema for a set of registered component types. */
function componentTypeEnum(components: AIComponentDef[]): JSONSchema {
  return {
    type: 'string',
    enum: components.map(c => c.type),
    description: 'Must match a component type registered via ComponentRegistry'
  }
}

/** JSON Schema for an Event — constrains `type` to registered event IDs. */
function generateEventSchema(events: AIEventDef[]): JSONSchema {
  return {
    type: 'object',
    title: 'Event',
    description: 'Describes when a trigger fires',
    properties: {
      type: eventTypeEnum(events),
      source: {
        type: 'string',
        description: 'Component name from components[].name. Required when the event originates from a component.'
      },
      payload: {
        type: 'object',
        description: 'Optional event payload',
        additionalProperties: true
      }
    },
    required: ['type'],
    additionalProperties: false
  }
}

/** JSON Schema for Action.params — built per-registration. */
function generateActionParamsSchema(params: Record<string, ParamSchema> | undefined): JSONSchema {
  if (!params || Object.keys(params).length === 0) {
    return { type: 'object', additionalProperties: true }
  }
  const properties: Record<string, JSONSchema> = {}
  const required: string[] = []
  for (const [name, param] of Object.entries(params)) {
    properties[name] = paramToSchema(param)
    if (param.required)
      required.push(name)
  }
  const schema: JSONSchema = { type: 'object', properties, additionalProperties: false }
  if (required.length)
    schema.required = required
  return schema
}

/** JSON Schema for a single Action. */
function generateActionSchema(action: AIActionDef): JSONSchema {
  return {
    type: 'object',
    title: 'Action',
    description: action.description,
    properties: {
      type: actionTypeEnum([action]),
      params: generateActionParamsSchema(action.params)
    },
    required: ['type'],
    additionalProperties: false
  }
}

/** JSON Schema for an ActionNode union (Action + flow control). */
function generateActionNodeSchema(actions: AIActionDef[]): JSONSchema {
  const actionVariants = actions.map(a => generateActionSchema(a))
  return {
    oneOf: [
      ...actionVariants,
      { $ref: '#/definitions/Sequence' },
      { $ref: '#/definitions/Parallel' },
      { $ref: '#/definitions/If' },
      { $ref: '#/definitions/TryCatch' }
    ]
  }
}

// ============================================================================
// Public API
// ============================================================================

/** Top-level options for `generateToolSchema`. */
export interface GenerateToolSchemaOptions {
  registry: AIRegistry
  /** When provided, enables component generation mode. */
  component?: ComponentRegistry
}

/**
 * Generate a JSON Schema for a single Triggerix trigger, constrained by the
 * registry. Suitable for use as the `items` of a `triggers` array.
 */
export function generateRuleSchema(registry: AIRegistry): JSONSchema {
  const events = registry.getEvents()
  const actions = registry.getActions()
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'Trigger',
    description: 'An Event-Condition-Action rule',
    properties: {
      id: { type: 'string', description: 'Unique trigger identifier' },
      name: { type: 'string', description: 'Human-readable name' },
      // Multiple events use OR semantics at runtime — any one match fires the trigger.
      events: {
        type: 'array',
        items: generateEventSchema(events),
        minItems: 1
      },
      // Flat condition array with implicit AND; explicit nested groups still allowed.
      conditions: {
        type: 'array',
        items: { $ref: '#/definitions/ConditionItem' }
      },
      actions: {
        type: 'array',
        items: generateActionNodeSchema(actions),
        minItems: 1
      }
    },
    required: ['id', 'events', 'actions'],
    additionalProperties: false,
    definitions: {
      Condition: CONDITION_SCHEMA,
      ConditionGroup: CONDITION_GROUP_SCHEMA,
      ConditionItem: CONDITION_ITEM_SCHEMA,
      ActionNode: generateActionNodeSchema(actions),
      ...FLOW_DEFINITIONS
    }
  }
}

/**
 * Generate the JSON Schema for the AI tool's `parameters` field.
 *
 *  - With `component`: schema is `{ components: ComponentInstance[], triggers: Trigger[] }`
 *  - Without `component`: schema is `{ triggers: Trigger[] }` (trigger-only mode)
 */
export function generateToolSchema(options: GenerateToolSchemaOptions): JSONSchema {
  const { registry, component } = options
  const triggersProp: JSONSchema = {
    type: 'array',
    items: generateRuleSchema(registry),
    description: 'Triggerix triggers to bind to component events'
  }

  if (!component) {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'TriggerixAIOutput',
      description: 'Trigger-only output: a list of triggers to load',
      properties: { triggers: triggersProp },
      required: ['triggers'],
      additionalProperties: false
    }
  }

  const components = component.getComponents()
  // Build once and reuse for both `items` and the top-level `$ref` so the
  // emitted schema is structurally consistent.
  const componentInstanceSchema: JSONSchema = {
    type: 'object',
    title: 'ComponentInstance',
    description: 'A component instance emitted by the AI',
    properties: {
      type: componentTypeEnum(components),
      name: {
        type: 'string',
        description: 'Semantic local name, unique within one AI output. Used by trigger `event.source` and `$ref`.'
      },
      // Permissive by design: per-prop constraints live in the component
      // registry and are surfaced to the LLM via the system prompt.
      // Strict per-component oneOf would explode combinatorially with N types.
      props: { type: 'object', additionalProperties: true },
      children: {
        type: 'array',
        items: { $ref: '#/definitions/ComponentInstance' }
      }
    },
    required: ['type'],
    additionalProperties: false
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'TriggerixAIOutput',
    description: 'Component + trigger output: components to render, triggers to bind',
    properties: {
      components: {
        type: 'array',
        items: componentInstanceSchema,
        description: 'Atomic components the renderer will mount'
      },
      triggers: triggersProp
    },
    required: ['components', 'triggers'],
    additionalProperties: false,
    definitions: {
      ComponentInstance: componentInstanceSchema
    }
  }
}
