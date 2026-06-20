import {
  BASE_TOOL_CALLING_PROTOCOL,
  defineTools
} from '@triggerix-ai/fn'
import { describe, expect, it } from 'vitest'

describe('defineTools', () => {
  it('returns empty tools array when tools is empty', () => {
    const result = defineTools({ tools: [] })
    expect(result.tools).toEqual([])
  })

  it('produces an OpenAI-compatible tool definition for a single tool with no params', () => {
    const result = defineTools({
      tools: [{
        name: 'ping',
        description: 'Pings the server',
        params: {}
      }]
    })

    expect(result.tools).toHaveLength(1)
    const tool = result.tools[0]
    expect(tool.type).toBe('function')
    expect(tool.function.name).toBe('ping')
    expect(tool.function.description).toBe('Pings the server')
    expect(tool.function.parameters).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false
    })
  })

  it('preserves input order when multiple tools are supplied', () => {
    const result = defineTools({
      tools: [
        { name: 'first_tool', description: 'A', params: {} },
        { name: 'second_tool', description: 'B', params: {} },
        { name: 'third_tool', description: 'C', params: {} }
      ]
    })

    expect(result.tools.map(t => t.function.name)).toEqual([
      'first_tool',
      'second_tool',
      'third_tool'
    ])
  })

  it('marks required params in schema.required', () => {
    const result = defineTools({
      tools: [{
        name: 'create_user',
        description: 'Create a user',
        params: {
          name: { type: 'string', required: true },
          age: { type: 'number', required: true }
        }
      }]
    })

    const params = result.tools[0].function.parameters as any
    expect(params.required).toEqual(['name', 'age'])
    expect(params.properties.name.type).toBe('string')
    expect(params.properties.age.type).toBe('number')
  })

  it('does not include optional params in schema.required', () => {
    const result = defineTools({
      tools: [{
        name: 'greet',
        description: 'Greet someone',
        params: {
          // explicit required: false
          name: { type: 'string', required: false },
          // missing required entirely
          locale: { type: 'string' }
        }
      }]
    })

    const params = result.tools[0].function.parameters as any
    expect(params.required).toBeUndefined()
    expect(params.properties.name).toBeDefined()
    expect(params.properties.locale).toBeDefined()
  })

  it('includes enum values in schema.enum', () => {
    const result = defineTools({
      tools: [{
        name: 'set_mode',
        description: 'Set the mode',
        params: {
          mode: {
            type: 'string',
            enum: ['dark', 'light', 'auto']
          }
        }
      }]
    })

    const prop = (result.tools[0].function.parameters as any).properties.mode
    expect(prop.enum).toEqual(['dark', 'light', 'auto'])
  })

  it('includes description in schema.description', () => {
    const result = defineTools({
      tools: [{
        name: 'do_thing',
        description: 'Does a thing',
        params: {
          thing: {
            type: 'string',
            description: 'The thing to do'
          }
        }
      }]
    })

    const prop = (result.tools[0].function.parameters as any).properties.thing
    expect(prop.description).toBe('The thing to do')
  })

  it('includes default in schema.default', () => {
    const result = defineTools({
      tools: [{
        name: 'do_thing',
        description: 'Does a thing',
        params: {
          count: {
            type: 'number',
            default: 10
          },
          enabled: {
            type: 'boolean',
            default: true
          }
        }
      }]
    })

    const props = (result.tools[0].function.parameters as any).properties
    expect(props.count.default).toBe(10)
    expect(props.enabled.default).toBe(true)
  })

  it('expands nested object params via properties and requiredProps', () => {
    const result = defineTools({
      tools: [{
        name: 'create_address',
        description: 'Create an address',
        params: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zip: { type: 'string' }
            },
            requiredProps: ['street', 'city']
          }
        }
      }]
    })

    const prop = (result.tools[0].function.parameters as any).properties.address
    expect(prop.type).toBe('object')
    expect(prop.properties.street.type).toBe('string')
    expect(prop.properties.city.type).toBe('string')
    expect(prop.properties.zip.type).toBe('string')
    expect(prop.required).toEqual(['street', 'city'])
    // all keys required => strict => additionalProperties false
    expect(prop.additionalProperties).toBe(false)
  })

  it('expands array params with items into JSON Schema', () => {
    const result = defineTools({
      tools: [{
        name: 'tag_items',
        description: 'Tag items',
        params: {
          tags: {
            type: 'array',
            description: 'List of tags',
            items: {
              type: 'string',
              enum: ['red', 'green', 'blue']
            }
          }
        }
      }]
    })

    const prop = (result.tools[0].function.parameters as any).properties.tags
    expect(prop.type).toBe('array')
    expect(prop.description).toBe('List of tags')
    expect(prop.items).toBeDefined()
    expect(prop.items.type).toBe('string')
    expect(prop.items.enum).toEqual(['red', 'green', 'blue'])
  })

  it('appends custom systemPrompt after BASE_TOOL_CALLING_PROTOCOL with \\n\\n separator', () => {
    const result = defineTools({
      tools: [],
      systemPrompt: 'You are a helpful assistant.'
    })

    expect(result.systemPrompt).toBe(
      `${BASE_TOOL_CALLING_PROTOCOL}\n\nYou are a helpful assistant.`
    )
  })

  it('uses custom toolChoice when provided', () => {
    const result = defineTools({
      tools: [],
      toolChoice: 'required'
    })
    expect(result.toolChoice).toBe('required')

    const none = defineTools({
      tools: [],
      toolChoice: 'none'
    })
    expect(none.toolChoice).toBe('none')
  })

  it('defaults toolChoice to "auto"', () => {
    const result = defineTools({ tools: [] })
    expect(result.toolChoice).toBe('auto')
  })

  it('uses only BASE_TOOL_CALLING_PROTOCOL when no systemPrompt is provided', () => {
    const result = defineTools({ tools: [] })
    expect(result.systemPrompt).toBe(BASE_TOOL_CALLING_PROTOCOL)
  })

  it('uses the name field verbatim (lowercase + underscores, no validation transform)', () => {
    const result = defineTools({
      tools: [{
        name: 'update_user_nickname_v2',
        description: 'Update user nickname',
        params: {}
      }]
    })

    expect(result.tools[0].function.name).toBe('update_user_nickname_v2')
  })
})
