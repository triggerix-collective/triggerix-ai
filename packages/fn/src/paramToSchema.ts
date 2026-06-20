import type { JSONSchema, ToolParamDef } from './types'

/**
 * Convert a `ToolParamDef` to its JSON Schema (draft-07 subset) representation.
 *
 * The mapping is total over `JSONSchemaType` — every `ToolParamDef.type` produces
 * a schema fragment with the right shape and constraints. Nested `object` and
 * `array` params are walked recursively.
 */
export function paramToJSONSchema(param: ToolParamDef): JSONSchema {
  const schema: JSONSchema = { type: param.type }
  if (param.description !== undefined)
    schema.description = param.description
  if (param.enum !== undefined)
    schema.enum = param.enum
  if (param.default !== undefined)
    schema.default = param.default

  if (param.type === 'array') {
    if (!param.items)
      throw new TypeError(`ToolParamDef of type 'array' requires 'items'`)
    schema.items = paramToJSONSchema(param.items)
  }

  if (param.type === 'object') {
    const props = param.properties ?? {}
    const properties: Record<string, JSONSchema> = {}
    for (const [k, v] of Object.entries(props))
      properties[k] = paramToJSONSchema(v)

    schema.properties = properties
    const requiredProps = param.requiredProps ?? []
    if (requiredProps.length)
      schema.required = [...requiredProps]
    // Tools accept arbitrary extra fields by default; the caller can override
    // via `additionalProperties: false` semantics by marking all keys required.
    schema.additionalProperties = !(requiredProps.length > 0)
  }

  return schema
}

/**
 * Build the top-level JSON Schema `parameters` for a tool.
 * Aggregates every param's schema, collects `required` keys, and sets
 * `additionalProperties: false` (we want strict args).
 */
export function buildToolParameters(
  params: Record<string, ToolParamDef>
): JSONSchema {
  const properties: Record<string, JSONSchema> = {}
  const required: string[] = []
  for (const [name, def] of Object.entries(params)) {
    properties[name] = paramToJSONSchema(def)
    if (def.required)
      required.push(name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false
  }
}
