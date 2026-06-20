import {
  // registry
  AIRegistry,
  BASE_TOOL_CALLING_PROTOCOL,
  // component
  BaseRenderer,
  ComponentDef,
  ComponentRegistry,
  createAIRegistry,
  createComponentRegistry,
  defineAIAction,
  defineAIComponent,
  defineAICondition,
  defineAIEvent,
  // fn
  defineTools
} from 'triggerix-ai'
import { describe, expect, it } from 'vitest'

describe('triggerix-ai aggregate', () => {
  it('should re-export registry APIs', () => {
    expect(typeof createAIRegistry).toBe('function')
    expect(typeof defineAIEvent).toBe('function')
    expect(typeof defineAIAction).toBe('function')
    expect(typeof defineAICondition).toBe('function')
    const r = createAIRegistry()
    expect(r).toBeInstanceOf(AIRegistry)
  })

  it('should re-export component APIs', () => {
    expect(typeof createComponentRegistry).toBe('function')
    expect(typeof defineAIComponent).toBe('function')
    expect(ComponentRegistry).toBeDefined()
    expect(typeof ComponentDef).toBe('function')
    expect(typeof BaseRenderer).toBe('function')
  })

  it('should re-export fn APIs', () => {
    expect(typeof defineTools).toBe('function')
    expect(typeof BASE_TOOL_CALLING_PROTOCOL).toBe('string')
  })

  it('should compose end-to-end via a single import', () => {
    const registry = createAIRegistry()
    registry.registerEvent(defineAIEvent({
      id: 'button.click',
      label: 'Button Click',
      description: 'A button is clicked'
    }))
    registry.registerAction(defineAIAction({
      id: 'toast.show',
      label: 'Show Toast',
      description: 'Display a toast'
    }))

    const component = createComponentRegistry()
    component.registerComponent(defineAIComponent({
      type: 'button',
      label: 'Button',
      description: 'A button',
      events: ['button.click']
    }))

    const { systemPrompt, tools } = defineTools({
      tools: [{
        name: 'generate_triggerix_output',
        description: 'Generate UI bundle',
        params: {}
      }],
      systemPrompt: 'button.click and toast.show are available'
    })
    expect(systemPrompt).toContain('button.click')
    expect(systemPrompt).toContain('toast.show')
    expect(systemPrompt).toContain(BASE_TOOL_CALLING_PROTOCOL)
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe('generate_triggerix_output')
  })
})
