/**
 * Subset of JSON Schema draft-07 sufficient for AI tool input definitions.
 */
export interface JSONSchema {
  $schema?: string
  $id?: string
  $ref?: string
  title?: string
  description?: string
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | Array<'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'>
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: string[]
  enum?: unknown[]
  oneOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  allOf?: JSONSchema[]
  additionalProperties?: boolean | JSONSchema
  minItems?: number
  definitions?: Record<string, JSONSchema>
  const?: unknown
  default?: unknown
}
