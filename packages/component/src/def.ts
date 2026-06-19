import type {
  AIComponentDef,
  ComponentPropSchema,
  EmitFn
} from './types'

/**
 * Abstract base class for a concrete component implementation.
 *
 * Concrete renderers (DOM / React / Vue) extend this and implement `create()`
 * to produce the renderer's element type. The base class manages:
 *
 *  - AI-facing metadata (`type`, `label`, `description`, `props`, …)
 *  - DOM-event → Triggerix-event ID bindings (e.g. `bind('click', 'button.click')`)
 *  - The derived `events` list read by `ComponentRegistry.use()`
 *
 * Subclasses only need to implement `create()`.
 */
export abstract class ComponentDef<T = unknown> {
  abstract readonly type: string
  abstract readonly label: string
  abstract readonly description: string
  readonly container?: boolean
  readonly props?: Record<string, ComponentPropSchema>
  readonly prompt?: string

  /** domEvent → Triggerix eventId bindings (renderer-specific convention). */
  protected readonly eventBindings = new Map<string, string>()

  /**
   * Map a renderer-native event name to a Triggerix event ID.
   * Chainable. Re-binding the same DOM event overrides.
   */
  bind(domEvent: string, eventId: string): this {
    this.eventBindings.set(domEvent, eventId)
    return this
  }

  /** Triggerix event IDs declared via `bind()`. */
  get events(): string[] {
    return [...this.eventBindings.values()]
  }

  /**
   * Build a renderer-native element for a given AI prop bag.
   * Implementations should attach `emit` listeners for any bound DOM events.
   */
  abstract create(props: Record<string, unknown>, emit: EmitFn): T
}

/**
 * Identity helper for declaring pure AI metadata without a concrete implementation.
 * Use when you only need to constrain what the AI can emit, with no renderer attached.
 */
export function defineAIComponent(def: AIComponentDef): AIComponentDef {
  return def
}
