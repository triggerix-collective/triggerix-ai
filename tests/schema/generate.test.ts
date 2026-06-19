import {
  createComponentRegistry,
  defineAIComponent
} from '@triggerix-ai/component'
import {
  createAIRegistry,
  defineAIAction,
  defineAIEvent
} from '@triggerix-ai/registry'
import { generateRuleSchema, generateToolSchema } from '@triggerix-ai/schema'
import { describe, expect, it } from 'vitest'

function fixtureRegistry() {
  const registry = createAIRegistry()
  registry.registerEvent(defineAIEvent({
    id: 'button.click',
    label: 'Button Click',
    description: 'Triggered when a button is clicked',
    params: { source: { type: 'string' } }
  }))
  registry.registerEvent(defineAIEvent({
    id: 'input.blur',
    label: 'Input Blur',
    description: 'Triggered when an input loses focus'
  }))
  registry.registerAction(defineAIAction({
    id: 'api.request',
    label: 'API Request',
    description: 'Send HTTP request',
    params: {
      method: { type: 'string', enum: ['GET', 'POST'], required: true },
      url: { type: 'string', required: true }
    }
  }))
  registry.registerAction(defineAIAction({
    id: 'toast.show',
    label: 'Show Toast',
    description: 'Display a toast',
    params: { message: { type: 'string', required: true } }
  }))
  return registry
}

describe('generateRuleSchema', () => {
  it('should constrain event.type to registered event IDs', () => {
    const schema = generateRuleSchema(fixtureRegistry())
    const eventType = (schema.properties as any).event.properties.type
    expect(eventType.type).toBe('string')
    expect(eventType.enum).toEqual(['button.click', 'input.blur'])
  })

  it('should generate oneOf for actions with each registered type', () => {
    const schema = generateRuleSchema(fixtureRegistry())
    const actions = (schema as any).properties.actions
    expect(actions.type).toBe('array')
    expect(actions.minItems).toBe(1)
    const variants = actions.items.oneOf
    const types = variants.flatMap((v: any) =>
      v.properties ? [v.properties.type.enum[0]] : []
    )
    expect(types).toContain('api.request')
    expect(types).toContain('toast.show')
  })

  it('should embed flow control definitions', () => {
    const schema = generateRuleSchema(fixtureRegistry())
    const defs = (schema as any).definitions
    expect(defs.Sequence).toBeDefined()
    expect(defs.Parallel).toBeDefined()
    expect(defs.If).toBeDefined()
    expect(defs.TryCatch).toBeDefined()
  })

  it('should constrain action.params per registration', () => {
    const schema = generateRuleSchema(fixtureRegistry())
    const actionVariant = (schema as any).properties.actions.items.oneOf.find((v: any) => v.properties?.type?.enum?.[0] === 'api.request')
    expect(actionVariant).toBeDefined()
    const params = actionVariant.properties.params
    expect(params.properties.method.enum).toEqual(['GET', 'POST'])
    expect(params.required).toContain('method')
    expect(params.required).toContain('url')
  })

  it('should reflect new registrations dynamically', () => {
    const registry = fixtureRegistry()
    const schema1 = generateRuleSchema(registry)
    const before = (schema1 as any).properties.event.properties.type.enum.length

    registry.registerEvent(defineAIEvent({
      id: 'page.load',
      label: 'Page Load',
      description: 'Page load event'
    }))
    const schema2 = generateRuleSchema(registry)
    const after = (schema2 as any).properties.event.properties.type.enum.length
    expect(after).toBe(before + 1)
    expect((schema2 as any).properties.event.properties.type.enum).toContain('page.load')
  })
})

describe('generateToolSchema', () => {
  it('should produce triggers-only schema when no component registry', () => {
    const registry = fixtureRegistry()
    const schema = generateToolSchema({ registry })
    expect((schema as any).properties.triggers).toBeDefined()
    expect((schema as any).properties.components).toBeUndefined()
    expect(schema.required).toEqual(['triggers'])
  })

  it('should produce component+trigger schema when component registry provided', () => {
    const registry = fixtureRegistry()
    const component = createComponentRegistry()
    component.registerComponent(defineAIComponent({
      type: 'button',
      label: 'Button',
      description: 'Clickable button',
      events: ['button.click']
    }))
    component.registerComponent(defineAIComponent({
      type: 'input',
      label: 'Input',
      description: 'Text input',
      events: ['input.blur']
    }))

    const schema = generateToolSchema({ registry, component })
    expect((schema as any).properties.components).toBeDefined()
    expect((schema as any).properties.triggers).toBeDefined()
    expect(schema.required).toEqual(['components', 'triggers'])

    const componentType = (schema as any).properties.components.items.properties.type
    expect(componentType.enum).toEqual(['button', 'input'])
  })

  it('should allow nested ComponentInstance via $ref', () => {
    const registry = fixtureRegistry()
    const component = createComponentRegistry()
    component.registerComponent(defineAIComponent({
      type: 'card',
      label: 'Card',
      description: 'Container',
      container: true
    }))
    const schema = generateToolSchema({ registry, component })
    const defs = (schema as any).definitions
    expect(defs.ComponentInstance).toBeDefined()
    const childrenProp = defs.ComponentInstance.properties.children
    expect(childrenProp.type).toBe('array')
    expect(childrenProp.items.$ref).toBe('#/definitions/ComponentInstance')
  })
})
