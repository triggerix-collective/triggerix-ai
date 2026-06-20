import type { EmitFn } from 'triggerix-ai'
import {
  ComponentDef,
  createAIRegistry,
  createComponentRegistry,
  defineAIAction,
  defineAIEvent,
  defineTools
} from 'triggerix-ai'
import { describe, expect, it } from 'vitest'

/**
 * Integration smoke test: verify that registry/component primitives compose
 * with `defineTools` to produce a complete OpenAI-compatible tool definition.
 *
 * The new `defineTools` is generic (no knowledge of triggerix registries),
 * so the caller is responsible for formatting registry data into a system
 * prompt. This test exercises the composition path end-to-end.
 */
describe('end-to-end: defineTools composition', () => {
  it('should generate system prompt + tool schema covering the full flow', () => {
    // 1. Register domain events / actions
    const registry = createAIRegistry()
    registry.registerEvent(defineAIEvent({
      id: 'input.blur',
      label: 'Input Blur',
      description: 'Triggered when an input loses focus'
    }))
    registry.registerEvent(defineAIEvent({
      id: 'button.click',
      label: 'Button Click',
      description: 'Triggered when a button is clicked'
    }))
    registry.registerAction(defineAIAction({
      id: 'api.request',
      label: 'API Request',
      description: 'Send an HTTP request',
      params: {
        method: { type: 'string', enum: ['GET', 'POST'], required: true },
        url: { type: 'string', required: true },
        body: { type: 'object' }
      }
    }))
    registry.registerAction(defineAIAction({
      id: 'toast.show',
      label: 'Show Toast',
      description: 'Display a toast',
      params: { message: { type: 'string', required: true } }
    }))

    // 2. Register component catalog
    class NativeInput extends ComponentDef<unknown> {
      readonly type = 'input'
      readonly label = 'Input'
      readonly description = 'Text input field'
      readonly props = {
        placeholder: { type: 'string' as const },
        type: { type: 'string' as const, enum: ['text', 'number', 'password'] }
      }

      create(_props: Record<string, unknown>, _emit: EmitFn): unknown {
        return { tag: 'input' }
      }
    }
    class NativeButton extends ComponentDef<unknown> {
      readonly type = 'button'
      readonly label = 'Button'
      readonly description = 'Clickable button'
      readonly props = { label: { type: 'string' as const, required: true } }
      create(_props: Record<string, unknown>, _emit: EmitFn): unknown {
        return { tag: 'button' }
      }
    }
    const input = new NativeInput().bind('blur', 'input.blur').bind('change', 'input.change')
    const button = new NativeButton().bind('click', 'button.click')

    const component = createComponentRegistry()
    component.use([input, button])

    // 3. One-call generation via defineTools
    const { systemPrompt, tools } = defineTools({
      systemPrompt: 'Use input.blur, button.click with api.request / toast.show.',
      tools: [{
        name: 'generate_triggerix_output',
        description: 'Generate UI bundle with components and triggers',
        params: {
          components: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['input', 'button'] }
              },
              requiredProps: ['type']
            }
          },
          triggers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                events: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['input.blur', 'button.click'] }
                    },
                    requiredProps: ['type']
                  }
                }
              },
              requiredProps: ['events']
            }
          }
        }
      }]
    })

    // 4. Verify system prompt covers everything an LLM needs
    expect(systemPrompt).toContain('input.blur')
    expect(systemPrompt).toContain('button.click')
    expect(systemPrompt).toContain('api.request')
    expect(systemPrompt).toContain('toast.show')

    // 5. Verify tool definition
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe('generate_triggerix_output')
    const params = tools[0].function.parameters as any
    expect(params.properties.components.items.properties.type.enum).toEqual(['input', 'button'])
    expect(params.properties.triggers.items.properties.events.items.properties.type.enum)
      .toEqual(expect.arrayContaining(['input.blur', 'button.click']))
  })

  it('should produce a valid tool definition for trigger-only setups (no components)', () => {
    const registry = createAIRegistry()
    registry.registerEvent(defineAIEvent({
      id: 'page.load',
      label: 'Page Load',
      description: 'Page loaded'
    }))

    const { tools } = defineTools({
      tools: [{
        name: 'generate_triggers',
        description: 'Generate triggers',
        params: {
          triggers: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }]
    })

    const params = tools[0].function.parameters as any
    expect(params.properties.triggers).toBeDefined()
    expect(params.properties.components).toBeUndefined()
  })
})
