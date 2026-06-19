import type { ComponentInstance } from '@triggerix-ai/component'
import {
  BaseRenderer,
  ComponentDef,

  createComponentRegistry,
  defineAIComponent
} from '@triggerix-ai/component'
import { describe, expect, it } from 'vitest'

describe('componentRegistry', () => {
  it('should register and retrieve an AIComponentDef', () => {
    const reg = createComponentRegistry()
    const def = defineAIComponent({
      type: 'button',
      label: 'Button',
      description: 'Clickable button',
      events: ['button.click']
    })
    reg.registerComponent(def)
    expect(reg.getComponent('button')).toEqual(def)
  })

  it('should override on duplicate type', () => {
    const reg = createComponentRegistry()
    reg.registerComponent(defineAIComponent({ type: 'a', label: 'A1', description: 'd' }))
    reg.registerComponent(defineAIComponent({ type: 'a', label: 'A2', description: 'd' }))
    expect(reg.getComponent('a')?.label).toBe('A2')
  })

  it('should list all registered components', () => {
    const reg = createComponentRegistry()
    reg.registerComponent(defineAIComponent({ type: 'a', label: 'A', description: 'd' }))
    reg.registerComponent(defineAIComponent({ type: 'b', label: 'B', description: 'd' }))
    expect(reg.getComponents()).toHaveLength(2)
  })
})

describe('componentRegistry.use()', () => {
  class FakeButton extends ComponentDef<string> {
    readonly type = 'button'
    readonly label = 'Button'
    readonly description = 'A clickable button'
    readonly props = { label: { type: 'string', required: true } as const }
    readonly container = false
    create(props: Record<string, unknown>): string {
      return `[button:${props.label}]`
    }
  }

  class FakeCard extends ComponentDef<string> {
    readonly type = 'card'
    readonly label = 'Card'
    readonly description = 'A container card'
    readonly container = true
    create(): string {
      return '[card]'
    }
  }

  it('should extract AI metadata from ComponentDef instances', () => {
    const reg = createComponentRegistry()
    const button = new FakeButton().bind('click', 'button.click')
    const card = new FakeCard()
    reg.use([button, card])

    const b = reg.getComponent('button')
    expect(b?.label).toBe('Button')
    expect(b?.description).toBe('A clickable button')
    expect(b?.events).toEqual(['button.click'])
    expect(b?.props).toEqual({ label: { type: 'string', required: true } })

    const c = reg.getComponent('card')
    expect(c?.container).toBe(true)
    expect(c?.events).toEqual([])
  })

  it('should merge events from multiple bind() calls', () => {
    const reg = createComponentRegistry()
    class Input extends ComponentDef<string> {
      readonly type = 'input'
      readonly label = 'Input'
      readonly description = 'Text input'
      create(): string { return '[input]' }
    }
    const input = new Input()
      .bind('blur', 'input.blur')
      .bind('change', 'input.change')
    reg.use([input])

    expect(reg.getComponent('input')?.events).toEqual(['input.blur', 'input.change'])
  })
})

describe('componentDef', () => {
  class Stub extends ComponentDef<string> {
    readonly type = 'stub'
    readonly label = 'Stub'
    readonly description = 'For testing'
    create(props: Record<string, unknown>, emit: (eventId: string) => void): string {
      emit('stub.created')
      return `stub:${String(props.x ?? '')}`
    }
  }

  it('should produce the create() output', () => {
    const s = new Stub()
    let emitted = ''
    const el = s.create({ x: 1 }, (id) => {
      emitted = id
    })
    expect(el).toBe('stub:1')
    expect(emitted).toBe('stub.created')
  })

  it('should reflect subsequent bind() calls in events', () => {
    const s = new Stub().bind('click', 'stub.click').bind('hover', 'stub.hover')
    expect(s.events).toEqual(['stub.click', 'stub.hover'])
  })

  it('should override when re-binding same DOM event', () => {
    const s = new Stub().bind('click', 'old.click').bind('click', 'new.click')
    expect(s.events).toEqual(['new.click'])
  })
})

describe('baseRenderer', () => {
  class Stub extends ComponentDef<unknown> {
    readonly type = 'stub'
    readonly label = 'Stub'
    readonly description = 'd'
    create(): unknown { return null }
  }

  class FakeRenderer extends BaseRenderer<unknown> {
    mount(): { unmount: () => void } {
      return { unmount() {} }
    }
  }

  it('should auto-register components supplied to constructor', () => {
    const renderer = new FakeRenderer({ components: [new Stub()] })
    expect(renderer.components.getComponent('stub')).toBeDefined()
  })

  it('should work with no components supplied', () => {
    const renderer = new FakeRenderer()
    expect(renderer.components.getComponents()).toEqual([])
  })
})

describe('componentInstance nesting', () => {
  it('should structurally support children', () => {
    const card: ComponentInstance = {
      type: 'card',
      props: { title: 'Hi' },
      children: [
        { type: 'label', props: { text: 'Name' } },
        { type: 'input', name: 'name', props: { placeholder: 'Enter' } }
      ]
    }
    expect(card.children).toHaveLength(2)
    expect(card.children?.[1].name).toBe('name')
  })
})
