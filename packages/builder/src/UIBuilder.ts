import type { ComponentInstance } from '@triggerix-ai/component'
import type { ActionNode, Trigger, Value } from '@triggerix/core'

/**
 * Result of a builder mutation. Either success or a list of human-readable
 * error messages that can be returned to the LLM (so it can correct itself
 * on the next tool call).
 */
export type BuilderResult = { ok: true } | { ok: false, errors: string[] }

/** Submitted UI ready to mount. */
export interface BuiltUI {
  components: ComponentInstance[]
  triggers: Trigger[]
}

export type SubmitResult
  = | ({ ok: true } & { mountTarget: BuiltUI })
    | { ok: false, errors: string[] }

/**
 * Stateful buffer for an AI-assembled UI draft.
 *
 * The LLM drives construction through `addComponent` / `addTrigger` /
 * `updateComponentProp` / `clear` / `submit`. The builder validates each
 * step and assembles a final `{ components, triggers }` on `submit()`.
 *
 * Trigger coalescing: calling `addTrigger` multiple times with the same
 * `(eventType, eventSource)` automatically appends the new action to the
 * existing trigger's action list (wrapped in `sequence` if >1).
 *
 * `$ref` resolution: action parameters may use the string form
 * `"$ref:<componentName>.<path>"` (e.g. `"$ref:nick.value"`) which the
 * builder converts to the runtime's `{ $ref: '...' }` object on submit.
 * Strings-as-refs keep the LLM from forgetting the `{}` braces.
 *
 * Validation: the builder is domain-agnostic. Callers inject the set of
 * valid component / action types via `setValidTypes()` (typically called
 * from `defineAtomicTools(builder, { components, actions })`).
 */
export class UIBuilder {
  private _components: ComponentInstance[] = []
  /** Pending triggers keyed by `${eventType}:${eventSource}`; submit() flushes. */
  private _pendingTriggers = new Map<string, { eventType: string, eventSource: string, actions: ActionNode[] }>()

  private _validComponentTypes: ReadonlySet<string> = new Set()
  private _validActionTypes: ReadonlySet<string> = new Set()

  constructor() {}

  /** Read-only view of the components added so far. */
  get components(): ReadonlyArray<ComponentInstance> {
    return this._components
  }

  /**
   * 注入白名单：哪些 component / action type 是合法的。
   * `defineAtomicTools` 会自动调这个方法（基于它收到的 components / actions 列表）。
   * 直接用 UIBuilder 的调用方应自行调一次。
   */
  setValidTypes(opts: { componentType: ReadonlySet<string>, actionType: ReadonlySet<string> }): void {
    this._validComponentTypes = opts.componentType
    this._validActionTypes = opts.actionType
  }

  addComponent(type: string, name: string, props?: Record<string, unknown>): BuilderResult {
    if (!this._validComponentTypes.has(type)) {
      return { ok: false, errors: [`Unknown component type: "${type}"`] }
    }
    if (this._components.some(c => c.name === name)) {
      return { ok: false, errors: [`Duplicate component name: "${name}"`] }
    }
    this._components.push({ type, name, props: props ?? {} })
    return { ok: true }
  }

  updateComponentProp(name: string, propName: string, value: unknown): BuilderResult {
    const c = this._components.find(c => c.name === name)
    if (!c)
      return { ok: false, errors: [`Component not found: "${name}"`] }
    c.props = { ...(c.props ?? {}), [propName]: value }
    return { ok: true }
  }

  /**
   * Add an event→action binding. Multiple calls with the same
   * `(eventType, eventSource)` are coalesced into a single trigger whose
   * actions are wrapped in a `sequence` flow node (or kept as a single
   * action if only one was added).
   */
  addTrigger(
    eventType: string,
    eventSource: string,
    actionType: string,
    actionParams: Record<string, unknown> = {}
  ): BuilderResult {
    if (!this._components.some(c => c.name === eventSource)) {
      return { ok: false, errors: [`Trigger source "${eventSource}" not in components`] }
    }
    if (!this._validActionTypes.has(actionType)) {
      return { ok: false, errors: [`Unknown action type: "${actionType}"`] }
    }
    const resolved = resolveRefsInParams(actionParams, this._components)
    if (!resolved.ok)
      return resolved

    const key = `${eventType}:${eventSource}`
    const pending = this._pendingTriggers.get(key)
    if (pending) {
      pending.actions.push({ type: actionType, params: resolved.value as Record<string, Value> })
    }
    else {
      this._pendingTriggers.set(key, {
        eventType,
        eventSource,
        actions: [{ type: actionType, params: resolved.value as Record<string, Value> }]
      })
    }
    return { ok: true }
  }

  clear(): BuilderResult {
    this._components = []
    this._pendingTriggers.clear()
    return { ok: true }
  }

  /**
   * Finalise the draft. Returns `mountTarget` if valid, otherwise a list of
   * errors that should be returned to the LLM.
   */
  submit(): SubmitResult {
    if (this._components.length === 0) {
      return { ok: false, errors: ['No components to submit'] }
    }
    const triggers: Trigger[] = []
    let i = 0
    for (const pending of this._pendingTriggers.values()) {
      const id = `trigger_${++i}`
      const actions = pending.actions.length === 1
        ? pending.actions
        : [{ type: 'sequence', actions: pending.actions } as ActionNode]
      triggers.push({
        id,
        events: pending.eventSource
          ? [{ type: pending.eventType, source: pending.eventSource }]
          : [{ type: pending.eventType }],
        actions
      })
    }
    return {
      ok: true,
      mountTarget: {
        components: [...this._components],
        triggers
      }
    }
  }
}

// ============================================================
// $ref 解析（"$ref:name.path" 字符串 → { $ref: 'name.path' } 对象）
// ============================================================

function isRefString(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('$ref:')
}

function refStringToRef(ref: string): string {
  return ref.slice(5)
}

function resolveRefsInParams(
  params: Record<string, unknown>,
  components: ReadonlyArray<ComponentInstance>
): { ok: true, value: Record<string, Value> } | { ok: false, errors: string[] } {
  const out: Record<string, Value> = {}
  for (const [k, v] of Object.entries(params)) {
    const r = resolveValue(v, components)
    if (!r.ok)
      return r
    out[k] = r.value
  }
  return { ok: true, value: out }
}

function resolveValue(
  v: unknown,
  components: ReadonlyArray<ComponentInstance>
): { ok: true, value: Value } | { ok: false, errors: string[] } {
  if (isRefString(v)) {
    const ref = refStringToRef(v)
    const [name] = ref.split('.')
    if (!name || !components.some(c => c.name === name)) {
      return { ok: false, errors: [`$ref "${ref}" source "${name}" not in components`] }
    }
    return { ok: true, value: { $ref: ref } as Value }
  }
  if (Array.isArray(v)) {
    const arr: Value[] = []
    for (const item of v) {
      const r = resolveValue(item, components)
      if (!r.ok)
        return r
      arr.push(r.value)
    }
    return { ok: true, value: arr as unknown as Value }
  }
  if (v && typeof v === 'object') {
    const obj: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      const r = resolveValue(val, components)
      if (!r.ok)
        return r
      obj[k] = r.value
    }
    return { ok: true, value: obj as unknown as Value }
  }
  return { ok: true, value: v as Value }
}
