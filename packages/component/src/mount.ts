import type { ComponentDef } from './def'
import type { AIOutput, EmitFn, Scope } from './types'

/**
 * Renderer-specific mount contract — abstracts how elements are attached to
 * and detached from a container. Concrete renderers (DOM, Vue, React, ...)
 * provide their own implementation:
 *
 * - `appendChild(container, element)`: attach an element to a container
 * - `removeChild(container, element)`: detach an element from a container
 *
 * The `TContainer` and `TElement` type parameters make this generic over
 * whatever the renderer's element model is (e.g. `HTMLElement` for DOM,
 * `VNode` for Vue, `ReactNode` for React).
 */
export interface RendererContext<TContainer, TElement> {
  appendChild: (container: TContainer, element: TElement) => void
  removeChild: (container: TContainer, element: TElement) => void
}

/**
 * Application-level emit callback. Receives the event id, the originating
 * component instance name (closure-captured by `mount` from `instance.name`),
 * and the event payload produced by the bound DOM event handler.
 */
export type MountEmitFn = (
  eventId: string,
  source: string | undefined,
  payload?: Record<string, unknown>
) => void

/**
 * Generic, renderer-agnostic AI output mount.
 *
 * Behaviour:
 * - Iterates `output.components`, finds the matching `ComponentDef` by `type`
 * - Calls `def.create(props, scopedEmit)` where `scopedEmit` captures
 *   `instance.name` as the `source` argument
 * - Appends each created element to `container` via `ctx.appendChild`
 * - Returns a `Scope` with `unmount()` to remove every element and clear
 *   the internal references
 *
 * Concrete renderers (e.g. `triggerix-ai-component-native`) typically expose
 * a thin convenience wrapper that pre-binds `ctx`.
 */
export function mount<TContainer, TElement>(
  output: AIOutput,
  container: TContainer,
  components: ReadonlyArray<ComponentDef<TElement>>,
  emit: MountEmitFn,
  ctx: RendererContext<TContainer, TElement>
): Scope {
  const elements = new Map<string, TElement>()
  const cleanups: Array<() => void> = []

  for (const instance of output.components) {
    const def = components.find(c => c.type === instance.type)
    if (!def)
      continue

    // Closure-capture source from instance.name; concrete components only
    // emit (eventId, payload) — mount injects source automatically.
    const source = instance.name
    const scopedEmit: EmitFn = (eventId, payload) => emit(eventId, source, payload)

    const el = def.create(instance.props ?? {}, scopedEmit)
    if (instance.name)
      elements.set(instance.name, el)
    ctx.appendChild(container, el)
    cleanups.push(() => ctx.removeChild(container, el))
  }

  return {
    unmount() {
      for (const fn of cleanups) fn()
      elements.clear()
    }
  }
}
