import {
  createComponentRegistry,
  defineAIComponent
} from '@triggerix-ai/component'
import { defineFunctionCalling } from '@triggerix-ai/fn'
import {
  createAIRegistry,
  defineAIAction,
  defineAIEvent
} from '@triggerix-ai/registry'
import { describe, expect, it } from 'vitest'

function fixture() {
  const registry = createAIRegistry()
  registry.registerEvent(defineAIEvent({
    id: 'button.click',
    label: 'Button Click',
    description: 'Triggered when a button is clicked'
  }))
  registry.registerAction(defineAIAction({
    id: 'toast.show',
    label: 'Show Toast',
    description: 'Display a toast',
    params: { message: { type: 'string', required: true } }
  }))
  return registry
}

describe('defineFunctionCalling', () => {
  it('should return { systemPrompt, tools }', () => {
    const result = defineFunctionCalling({ registry: fixture() })
    expect(typeof result.systemPrompt).toBe('string')
    expect(Array.isArray(result.tools)).toBe(true)
    expect(result.tools).toHaveLength(1)
  })

  it('should produce an OpenAI-compatible tool definition', () => {
    const [{ type, function: fn }] = defineFunctionCalling({ registry: fixture() }).tools
    expect(type).toBe('function')
    expect(typeof fn.name).toBe('string')
    expect(typeof fn.description).toBe('string')
    expect(fn.description.length).toBeGreaterThan(0)
    expect(fn.parameters).toBeDefined()
    expect((fn.parameters as any).type).toBe('object')
  })

  it('should include registered events in system prompt', () => {
    const { systemPrompt } = defineFunctionCalling({ registry: fixture() })
    expect(systemPrompt).toContain('button.click')
  })

  it('should include registered actions with param schemas in system prompt', () => {
    const { systemPrompt } = defineFunctionCalling({ registry: fixture() })
    expect(systemPrompt).toContain('toast.show')
    expect(systemPrompt).toContain('message: string, required')
  })

  it('should produce trigger-only tool when no component registry is supplied', () => {
    const { tools } = defineFunctionCalling({ registry: fixture() })
    const params = (tools[0].function.parameters as any).properties
    expect(params.triggers).toBeDefined()
    expect(params.components).toBeUndefined()
  })

  it('should produce component+trigger tool when component registry is supplied', () => {
    const component = createComponentRegistry()
    component.registerComponent(defineAIComponent({
      type: 'button',
      label: 'Button',
      description: 'Clickable button',
      events: ['button.click']
    }))
    const { tools, systemPrompt } = defineFunctionCalling({ registry: fixture(), component })
    const params = (tools[0].function.parameters as any).properties
    expect(params.triggers).toBeDefined()
    expect(params.components).toBeDefined()
    expect((params.components.items.properties.type as any).enum).toEqual(['button'])
    expect(systemPrompt).toContain('## Available Components')
    expect(systemPrompt).toContain('`button` → `button.click`')
  })

  it('should honor custom toolName', () => {
    const { tools } = defineFunctionCalling({
      registry: fixture(),
      toolName: 'make_ui'
    })
    expect(tools[0].function.name).toBe('make_ui')
  })

  it('should honor custom toolDescription', () => {
    const { tools } = defineFunctionCalling({
      registry: fixture(),
      toolDescription: 'Custom description for my app'
    })
    expect(tools[0].function.description).toBe('Custom description for my app')
  })

  it('should default tool name to "generate_triggerix_output"', () => {
    const { tools } = defineFunctionCalling({ registry: fixture() })
    expect(tools[0].function.name).toBe('generate_triggerix_output')
  })

  it('should reflect new registrations in both system prompt and tool parameters', () => {
    const registry = fixture()
    const before = defineFunctionCalling({ registry })
    registry.registerEvent(defineAIEvent({
      id: 'page.load',
      label: 'Page Load',
      description: 'Page loaded'
    }))
    const after = defineFunctionCalling({ registry })
    expect(after.systemPrompt).toContain('page.load')
    expect(before.systemPrompt).not.toContain('page.load')
    const beforeTypes = (before.tools[0].function.parameters as any).properties.triggers.items.properties.events.items.properties.type.enum
    const afterTypes = (after.tools[0].function.parameters as any).properties.triggers.items.properties.events.items.properties.type.enum
    expect(afterTypes).toContain('page.load')
    expect(beforeTypes).not.toContain('page.load')
  })
})
