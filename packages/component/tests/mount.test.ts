import type { ComponentDef } from '../src/def'
import type { RendererContext } from '../src/mount'
import type { AIOutput } from '../src/types'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '../src/mount'

interface TestEl {
  tag: 'div'
  props: Record<string, unknown>
  children: TestEl[]
  emit: (eventId: string, payload?: Record<string, unknown>) => void
}

function makeDef(type: string): ComponentDef<TestEl> & { createSpy: ReturnType<typeof vi.fn> } {
  const createSpy = vi.fn()
  const def = Object.create(null) as ComponentDef<TestEl> & { createSpy: ReturnType<typeof vi.fn> }
  Object.defineProperty(def, 'type', { value: type })
  Object.defineProperty(def, 'label', { value: type })
  Object.defineProperty(def, 'description', { value: '' })
  def.createSpy = createSpy
  def.create = (props, emit) => {
    createSpy(props, emit)
    return { tag: 'div', props, children: [], emit }
  }
  return def
}

function makeContext(): RendererContext<TestEl, TestEl> & {
  appended: TestEl[]
  removed: TestEl[]
} {
  const appended: TestEl[] = []
  const removed: TestEl[] = []
  const ctx = Object.create(null) as RendererContext<TestEl, TestEl> & {
    appended: TestEl[]
    removed: TestEl[]
  }
  ctx.appended = appended
  ctx.removed = removed
  ctx.appendChild = (_c, el) => {
    appended.push(el)
  }
  ctx.removeChild = (_c, el) => {
    removed.push(el)
  }
  return ctx
}

describe('mount $ref normalisation and resolver wiring', () => {
  it('passes props through unchanged when no $ref and no resolver', () => {
    const def = makeDef('button')
    const ctx = makeContext()
    const output: AIOutput = {
      components: [{ type: 'button', name: 'b1', props: { label: 'Hello' } }],
      triggers: []
    }
    mount(output, {} as TestEl, [def], () => {}, ctx)
    expect(def.createSpy).toHaveBeenCalledWith(
      { label: 'Hello' },
      expect.any(Function)
    )
  })

  it('converts string "$ref:foo.bar" into { $ref: "foo.bar" } before passing to def.create', () => {
    const def = makeDef('input')
    const ctx = makeContext()
    const output: AIOutput = {
      components: [{ type: 'input', name: 'inp', props: { value: '$ref:user.nickname' } }],
      triggers: []
    }
    mount(output, {} as TestEl, [def], () => {}, ctx)
    expect(def.createSpy).toHaveBeenCalledWith(
      { value: { $ref: 'user.nickname' } },
      expect.any(Function)
    )
  })

  it('resolves { $ref } against the supplied refResolver when provided', () => {
    const def = makeDef('input')
    const ctx = makeContext()
    const refResolver = (path: string) => {
      if (path === 'user.nickname')
        return '游客'
      return undefined
    }
    const output: AIOutput = {
      components: [{ type: 'input', name: 'inp', props: { value: '$ref:user.nickname' } }],
      triggers: []
    }
    mount(output, {} as TestEl, [def], () => {}, ctx, refResolver)
    expect(def.createSpy).toHaveBeenCalledWith(
      { value: '游客' },
      expect.any(Function)
    )
  })

  it('normalises nested $ref strings in arrays and objects', () => {
    const def = makeDef('select')
    const ctx = makeContext()
    const output: AIOutput = {
      components: [
        {
          type: 'select',
          name: 's1',
          props: {
            options: [{ value: '$ref:a' }, { value: 'plain' }],
            meta: { note: '$ref:b.note' }
          }
        }
      ],
      triggers: []
    }
    const refResolver = (path: string) => `resolved(${path})`
    mount(output, {} as TestEl, [def], () => {}, ctx, refResolver)
    expect(def.createSpy).toHaveBeenCalledWith(
      {
        options: [{ value: 'resolved(a)' }, { value: 'plain' }],
        meta: { note: 'resolved(b.note)' }
      },
      expect.any(Function)
    )
  })

  it('leaves pre-existing { $ref } object form untouched in the normaliser', () => {
    const def = makeDef('input')
    const ctx = makeContext()
    const refResolver = (path: string) => `v(${path})`
    const output: AIOutput = {
      components: [{ type: 'input', name: 'inp', props: { value: { $ref: 'already.object' } } }],
      triggers: []
    }
    mount(output, {} as TestEl, [def], () => {}, ctx, refResolver)
    expect(def.createSpy).toHaveBeenCalledWith(
      { value: 'v(already.object)' },
      expect.any(Function)
    )
  })

  it('captures instance.name as the emit source', () => {
    const def = makeDef('button')
    const ctx = makeContext()
    const output: AIOutput = {
      components: [{ type: 'button', name: 'btn1', props: {} }],
      triggers: []
    }
    const appEmit = vi.fn()
    mount(output, {} as TestEl, [def], appEmit, ctx)
    // First arg of create is props, second is the scoped emit fn.
    const scopedEmit = (def.createSpy.mock.calls[0] as unknown[])[1] as (
      eventId: string,
      payload?: Record<string, unknown>
    ) => void
    scopedEmit('button.click', { x: 1 })
    expect(appEmit).toHaveBeenCalledWith('button.click', 'btn1', { x: 1 })
  })

  it('unmount() removes every appended element and clears the name index', () => {
    const def = makeDef('button')
    const ctx = makeContext()
    const output: AIOutput = {
      components: [
        { type: 'button', name: 'a', props: {} },
        { type: 'button', name: 'b', props: {} }
      ],
      triggers: []
    }
    const scope = mount(output, {} as TestEl, [def], () => {}, ctx)
    expect(ctx.appended).toHaveLength(2)
    scope.unmount()
    expect(ctx.removed).toHaveLength(2)
  })
})
