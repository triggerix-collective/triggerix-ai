import {
  createComponentRegistry,
  defineAIComponent
} from '@triggerix-ai/component'
import { BASE_SYSTEM_PROMPT, generateSystemPrompt } from '@triggerix-ai/prompt'
import {
  createAIRegistry,
  defineAIAction,
  defineAICondition,
  defineAIEvent
} from '@triggerix-ai/registry'
import { describe, expect, it } from 'vitest'

describe('bASE_SYSTEM_PROMPT', () => {
  it('should be a non-empty string', () => {
    expect(typeof BASE_SYSTEM_PROMPT).toBe('string')
    expect(BASE_SYSTEM_PROMPT.length).toBeGreaterThan(500)
  })

  it('should cover ECA model, operators, flow control, expressions, $ref, output rules', () => {
    expect(BASE_SYSTEM_PROMPT).toContain('Event → Condition → Action')
    expect(BASE_SYSTEM_PROMPT).toContain('eq')
    expect(BASE_SYSTEM_PROMPT).toContain('sequence')
    expect(BASE_SYSTEM_PROMPT).toContain('parallel')
    expect(BASE_SYSTEM_PROMPT).toContain('tryCatch')
    expect(BASE_SYSTEM_PROMPT).toContain('$ref')
    expect(BASE_SYSTEM_PROMPT).toContain('$expr')
  })
})

describe('generateSystemPrompt', () => {
  it('should always start with the static base', () => {
    const prompt = generateSystemPrompt({ registry: createAIRegistry() })
    expect(prompt.startsWith(BASE_SYSTEM_PROMPT.slice(0, 50))).toBe(true)
  })

  it('should append an "Available Events" section listing each event', () => {
    const registry = createAIRegistry()
    registry.registerEvent(defineAIEvent({
      id: 'button.click',
      label: 'Button Click',
      description: 'Triggered when a button is clicked',
      params: { source: { type: 'string' } }
    }))
    const prompt = generateSystemPrompt({ registry })
    expect(prompt).toContain('## Available Events')
    expect(prompt).toContain('`button.click`: Triggered when a button is clicked')
    expect(prompt).toContain('source: string')
  })

  it('should list actions with their param schemas', () => {
    const registry = createAIRegistry()
    registry.registerAction(defineAIAction({
      id: 'api.request',
      label: 'API Request',
      description: 'Send an HTTP request',
      params: {
        method: { type: 'string', enum: ['GET', 'POST'], required: true },
        url: { type: 'string', required: true }
      }
    }))
    const prompt = generateSystemPrompt({ registry })
    expect(prompt).toContain('## Available Actions')
    expect(prompt).toContain('`api.request`')
    expect(prompt).toContain('method: string, enum=["GET","POST"], required')
    expect(prompt).toContain('url: string, required')
  })

  it('should include prompt guidance when provided', () => {
    const registry = createAIRegistry()
    registry.registerEvent(defineAIEvent({
      id: 'x',
      label: 'X',
      description: 'X',
      prompt: 'Prefer this over manual triggers'
    }))
    const prompt = generateSystemPrompt({ registry })
    expect(prompt).toContain('Guidance: Prefer this over manual triggers')
  })

  it('should include conditions section when conditions are registered', () => {
    const registry = createAIRegistry()
    registry.registerCondition(defineAICondition({
      id: 'isLoggedIn',
      label: 'Logged In',
      description: 'User is logged in'
    }))
    const prompt = generateSystemPrompt({ registry })
    expect(prompt).toContain('## Available Conditions')
    expect(prompt).toContain('`isLoggedIn`')
  })

  it('should switch to component-generation mode when component is supplied', () => {
    const registry = createAIRegistry()
    const component = createComponentRegistry()
    component.registerComponent(defineAIComponent({
      type: 'button',
      label: 'Button',
      description: 'A clickable button',
      events: ['button.click']
    }))
    component.registerComponent(defineAIComponent({
      type: 'card',
      label: 'Card',
      description: 'A container card',
      container: true
    }))

    const prompt = generateSystemPrompt({ registry, component })
    expect(prompt).toContain('## Available Components')
    expect(prompt).toContain('`button` (Button)')
    expect(prompt).toContain('Container: can have children')
    expect(prompt).toContain('`button` → `button.click`')
  })

  it('should omit component sections when no component is provided', () => {
    const prompt = generateSystemPrompt({ registry: createAIRegistry() })
    expect(prompt).not.toContain('## Available Components')
    expect(prompt).not.toContain('## Component → Event Map')
  })

  it('should produce a non-empty result even with empty registries', () => {
    const prompt = generateSystemPrompt({ registry: createAIRegistry() })
    expect(prompt.length).toBeGreaterThan(0)
  })
})
