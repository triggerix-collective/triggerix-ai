import type { EmitFn } from 'triggerix-ai'
import {
  ComponentDef,
  createAIRegistry,
  createComponentRegistry,
  defineAIAction,
  defineAIEvent,
  defineFunctionCalling

} from 'triggerix-ai'
import { describe, expect, it } from 'vitest'

/**
 * End-to-end smoke test of the spec's "modify nickname" scenario,
 * verifying that the full AI tool definition can be produced from
 * a single defineFunctionCalling call.
 */
describe('end-to-end: modify nickname', () => {
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

    // 2. Register component catalog with realistic implementation (DOM-shaped)
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

    // 3. One-call generation
    const { systemPrompt, tools } = defineFunctionCalling({ registry, component })

    // 4. Verify system prompt covers everything an LLM needs
    expect(systemPrompt).toContain('Event → Condition → Action')
    expect(systemPrompt).toContain('`input.blur`')
    expect(systemPrompt).toContain('`button.click`')
    expect(systemPrompt).toContain('`api.request`')
    expect(systemPrompt).toContain('`toast.show`')
    expect(systemPrompt).toContain('## Available Components')
    expect(systemPrompt).toContain('`input` → `input.blur`, `input.change`')
    expect(systemPrompt).toContain('`button` → `button.click`')

    // 5. Verify tool definition
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe('generate_triggerix_output')
    const params = tools[0].function.parameters as any
    expect(params.required).toEqual(['components', 'triggers'])
    // enum constraints present
    expect(params.properties.components.items.properties.type.enum).toEqual(['input', 'button'])
    expect(params.properties.triggers.items.properties.event.properties.type.enum)
      .toEqual(expect.arrayContaining(['input.blur', 'button.click']))
    const actionVariants = params.properties.triggers.items.properties.actions.items.oneOf
    const actionTypes = actionVariants
      .filter((v: any) => v.properties?.type)
      .map((v: any) => v.properties.type.enum[0])
    expect(actionTypes).toEqual(expect.arrayContaining(['api.request', 'toast.show']))
  })

  it('should produce a trigger-only tool when no component registry is supplied', () => {
    const registry = createAIRegistry()
    registry.registerEvent(defineAIEvent({
      id: 'page.load',
      label: 'Page Load',
      description: 'Page loaded'
    }))

    const { tools, systemPrompt } = defineFunctionCalling({ registry })
    const params = tools[0].function.parameters as any
    expect(params.properties.components).toBeUndefined()
    expect(params.properties.triggers).toBeDefined()
    expect(params.required).toEqual(['triggers'])
    expect(systemPrompt).not.toContain('## Available Components')
  })
})
