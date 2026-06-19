import type { ComponentDef } from './def'
import type { AIOutput, Scope } from './types'
import { ComponentRegistry } from './registry'

/**
 * Renderer interface — turns AI output into renderer-native elements.
 * Implementations live in downstream packages (e.g. `triggerix-ai-component-native`).
 */
export interface Renderer<T = unknown> {
  mount: (output: AIOutput, container: T) => Scope
}

/**
 * Common base for renderers. Holds the component registry and accepts
 * concrete `ComponentDef` instances in its constructor.
 *
 * Concrete renderers only need to implement `mount()` — the registry
 * setup is handled here.
 */
export abstract class BaseRenderer<T = unknown> implements Renderer<T> {
  readonly components = new ComponentRegistry()

  constructor(options: { components?: ReadonlyArray<ComponentDef<unknown>> } = {}) {
    if (options.components?.length) {
      // ComponentDef structurally satisfies ComponentMetadataSource
      // (type/label/description as readonly fields + `events` getter),
      // so no cast is needed.
      this.components.use(options.components)
    }
  }

  abstract mount(output: AIOutput, container: T): Scope
}
