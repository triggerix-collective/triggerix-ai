import type { RefResolver } from '@triggerix/runtime'
import type { ComponentDef } from './def'
import type { AIOutput, EmitFn, Scope } from './types'
import { resolveRefsDeep } from '@triggerix/runtime'

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
 * - Normalises any `"$ref:foo.bar"` string values inside `props` into the
 *   runtime's `{ $ref: 'foo.bar' }` object form (the runtime protocol layer
 *   only recognises the object form; the string form is a convenience the
 *   builder exposes to LLMs so they don't forget the `{}` braces)
 * - If `refResolver` is supplied, every `{ $ref }` in the normalised props
 *   is resolved against it before reaching `def.create` (so component
 *   props can reference values outside the mounted output — e.g. the host
 *   application's reactive state)
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
  ctx: RendererContext<TContainer, TElement>,
  refResolver?: RefResolver
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

    const normalised = normaliseRefStrings(instance.props ?? {})
    const props = refResolver ? resolveRefsDeep(normalised, refResolver) : normalised

    const el = def.create(props as Record<string, unknown>, scopedEmit)
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

/**
 * Recursively convert `"$ref:foo.bar"` string leaves in a value tree into
 * the runtime's `{ $ref: 'foo.bar' }` object form. Non-string leaves and
 * sub-trees without ref strings pass through unchanged. The conversion is
 * idempotent: pre-existing `{ $ref }` objects are left alone.
 */
function normaliseRefStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.startsWith('$ref:') ? { $ref: value.slice(5) } : value
  }
  if (Array.isArray(value)) {
    return value.map(v => normaliseRefStrings(v))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normaliseRefStrings(v)
    }
    return out
  }
  return value
}
