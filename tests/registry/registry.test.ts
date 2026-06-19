import {
  createAIRegistry,
  defineAIAction,
  defineAICondition,
  defineAIEvent
} from '@triggerix-ai/registry'
import { describe, expect, it } from 'vitest'

describe('aIRegistry', () => {
  describe('createAIRegistry', () => {
    it('should return an AIRegistry instance', () => {
      const registry = createAIRegistry()
      expect(registry).toBeDefined()
      expect(typeof registry.registerEvent).toBe('function')
      expect(typeof registry.registerAction).toBe('function')
      expect(typeof registry.registerCondition).toBe('function')
    })
  })

  describe('events', () => {
    it('should register and retrieve an event with AI metadata', () => {
      const registry = createAIRegistry()
      const def = defineAIEvent({
        id: 'button.click',
        label: 'Button Click',
        description: 'Triggered when a button is clicked',
        prompt: 'Use this when the user clicks any button',
        params: { source: { type: 'string', description: 'Button name' } }
      })
      registry.registerEvent(def)
      expect(registry.getEvent('button.click')).toEqual(def)
    })

    it('should preserve optional prompt field', () => {
      const registry = createAIRegistry()
      const def = defineAIEvent({
        id: 'a',
        label: 'A',
        description: 'desc'
      })
      registry.registerEvent(def)
      expect(registry.getEvent('a')?.prompt).toBeUndefined()
    })
  })

  describe('actions', () => {
    it('should register and retrieve an action with params schema', () => {
      const registry = createAIRegistry()
      const def = defineAIAction({
        id: 'api.request',
        label: 'API Request',
        description: 'Send HTTP request',
        params: {
          method: { type: 'string', enum: ['GET', 'POST'], required: true },
          url: { type: 'string', required: true }
        }
      })
      registry.registerAction(def)
      expect(registry.getAction('api.request')).toEqual(def)
    })
  })

  describe('conditions', () => {
    it('should register and retrieve a condition', () => {
      const registry = createAIRegistry()
      const def = defineAICondition({
        id: 'isLoggedIn',
        label: 'Is Logged In',
        description: 'User is logged in'
      })
      registry.registerCondition(def)
      expect(registry.getCondition('isLoggedIn')).toEqual(def)
    })
  })

  describe('isolation', () => {
    it('should keep events/actions/conditions independent', () => {
      const registry = createAIRegistry()
      registry.registerEvent(defineAIEvent({ id: 'shared', label: 'e', description: 'd' }))
      registry.registerAction(defineAIAction({ id: 'shared', label: 'a', description: 'd' }))
      registry.registerCondition(defineAICondition({ id: 'shared', label: 'c', description: 'd' }))

      expect(registry.getEvent('shared')?.label).toBe('e')
      expect(registry.getAction('shared')?.label).toBe('a')
      expect(registry.getCondition('shared')?.label).toBe('c')
    })
  })

  describe('listing', () => {
    it('should list all registered events', () => {
      const registry = createAIRegistry()
      registry.registerEvent(defineAIEvent({ id: 'a', label: 'A', description: 'a' }))
      registry.registerEvent(defineAIEvent({ id: 'b', label: 'B', description: 'b' }))
      const events = registry.getEvents()
      expect(events).toHaveLength(2)
    })
  })
})
