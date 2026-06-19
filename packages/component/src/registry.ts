import type { AIComponentDef } from './types'

/**
 * Shape accepted by `ComponentRegistry.use()`.
 *
 * Expressed in terms of `AIComponentDef` (minus `events`, which the renderer
 * implementation provides via its `bind()` mappings) so the field set stays
 * in lockstep with the AI metadata interface.
 */
export type ComponentMetadataSource = Omit<AIComponentDef, 'events'> & { events: string[] }

/**
 * Registry of AI-facing component metadata.
 *
 * Two registration paths:
 *  - `registerComponent(def)` — register plain `AIComponentDef` (no implementation).
 *  - `use(components)` — auto-extract AI metadata from concrete `ComponentDef` implementations.
 */
export class ComponentRegistry {
  private readonly components = new Map<string, AIComponentDef>()

  /** Register AI metadata directly. */
  registerComponent(def: AIComponentDef): void {
    this.components.set(def.type, def)
  }

  /**
   * Extract AI metadata from concrete `ComponentDef` implementations
   * and register them. Equivalent to calling `registerComponent` for each
   * with metadata pulled from the implementation.
   */
  use(components: ReadonlyArray<ComponentMetadataSource>): void {
    for (const comp of components) {
      this.components.set(comp.type, {
        type: comp.type,
        label: comp.label,
        description: comp.description,
        props: comp.props,
        container: comp.container,
        prompt: comp.prompt,
        events: comp.events
      })
    }
  }

  getComponent(type: string): AIComponentDef | undefined {
    return this.components.get(type)
  }

  getComponents(): AIComponentDef[] {
    return [...this.components.values()]
  }
}

/**
 * Factory for ComponentRegistry.
 */
export function createComponentRegistry(): ComponentRegistry {
  return new ComponentRegistry()
}
