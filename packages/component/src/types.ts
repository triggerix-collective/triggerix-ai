/**
 * Schema for a single component prop.
 * Describes the shape of an AI-configurable prop without runtime behavior.
 */
export interface ComponentPropSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: unknown[]
  default?: unknown
  required?: boolean
}

/**
 * AI-facing metadata for a component.
 * What the LLM sees and reasons about — no rendering concerns.
 */
export interface AIComponentDef {
  /** Unique component type identifier (e.g. `'button'`, `'input'`). */
  type: string
  /** Human-readable label. */
  label: string
  /** Description of what the component does, written for an LLM audience. */
  description: string
  /** Triggerix event IDs this component can emit. */
  events?: string[]
  /** Per-prop schema. */
  props?: Record<string, ComponentPropSchema>
  /** Whether this component can contain child components. */
  container?: boolean
  /** Optional AI guidance. */
  prompt?: string
}

/**
 * A component instance emitted by the AI.
 *
 * `name` is a semantic local identifier — unique within a single AI output,
 * but not globally. Renderers scope names per mount so cross-turn reuse
 * requires no random suffixes.
 */
export interface ComponentInstance {
  type: string
  name?: string
  props?: Record<string, unknown>
  children?: ComponentInstance[]
}

/**
 * Callback for a component to emit a Triggerix event.
 * The renderer's mount scope wires this to trigger evaluation.
 */
export type EmitFn = (eventId: string, payload?: Record<string, unknown>) => void

/**
 * Complete AI output — components to render plus triggers to bind.
 * Kept loose-typed for `triggers` to avoid cross-package type coupling.
 */
export interface AIOutput {
  components: ComponentInstance[]
  triggers: unknown[]
}

/**
 * Lifecycle handle returned by `Renderer.mount()`.
 */
export interface Scope {
  /** Tear down DOM nodes, listeners, and references. */
  unmount: () => void
}
