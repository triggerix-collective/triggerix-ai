import { describe, expect, it } from 'vitest'
import { UIBuilder } from '../../packages/builder/src/UIBuilder'

/**
 * UIBuilder.onBeforeSubmit() validation hook tests.
 *
 * The hook lets apps register cross-component completeness validators that
 * run at the end of `submit()`. Any non-empty returned error array aborts
 * submit and the errors are returned to the LLM as the tool result so it
 * can correct the draft on the next round.
 *
 * Multiple validators may be registered; they all run, errors concatenate.
 */
describe('uIBuilder.onBeforeSubmit', () => {
  function makeBuilder(types: { components?: string[], actions?: string[] } = {}) {
    const b = new UIBuilder()
    b.setValidTypes({
      componentType: new Set(types.components ?? ['input', 'radio', 'button']),
      actionType: new Set(types.actions ?? ['save'])
    })
    return b
  }

  it('returns ok when no validator is registered', () => {
    const b = makeBuilder()
    b.addComponent('input', 'nick', { value: '$ref:user.nickname' })
    b.addComponent('button', 'btn', { label: '保存' })
    const r = b.submit()
    expect(r.ok).toBe(true)
  })

  it('aborts submit when validator returns errors', () => {
    const b = makeBuilder()
    b.onBeforeSubmit(() => ['incomplete draft'])
    b.addComponent('input', 'nick', { value: '$ref:user.nickname' })
    const r = b.submit()
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain('incomplete draft')
    }
  })

  it('returns concatenated errors from multiple validators', () => {
    const b = makeBuilder()
    b.onBeforeSubmit(() => ['error A'])
    b.onBeforeSubmit(() => ['error B', 'error C'])
    b.addComponent('input', 'nick', { value: '$ref:user.nickname' })
    const r = b.submit()
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toEqual(['error A', 'error B', 'error C'])
    }
  })

  it('receives finalised components and triggers', () => {
    const b = makeBuilder()
    let captured: { components: unknown[], triggers: unknown[] } | null = null
    b.onBeforeSubmit((components, triggers) => {
      captured = {
        components: components.map(c => c.name),
        triggers: triggers.map(t => t.id)
      }
      return []
    })
    b.addComponent('input', 'nick', { value: '$ref:user.nickname' })
    b.addComponent('button', 'btn', { label: '保存' })
    b.addTrigger('button.click', 'btn', 'save', { name: 'x' })
    b.submit()
    expect(captured).toEqual({
      components: ['nick', 'btn'],
      triggers: ['trigger_1']
    })
  })

  it('demo form-completeness scenario: editable without button is rejected', () => {
    // The exact bug we are fixing: AI builds only an input, no submit button.
    // The validator catches it before mount.
    const b = makeBuilder()
    b.onBeforeSubmit((components, _triggers) => {
      const hasEditable = components.some(c =>
        ['input', 'radio', 'select', 'checkbox'].includes(c.type)
      )
      const hasButton = components.some(c => c.type === 'button')
      if (hasEditable && !hasButton) {
        return ['草稿里有可编辑字段但没有提交按钮']
      }
      return []
    })
    b.addComponent('input', 'nick', { value: '$ref:user.nickname' })
    // Note: no button added.
    const r = b.submit()
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors[0]).toContain('可编辑字段')
    }
  })

  it('demo form-completeness scenario: button without trigger is rejected', () => {
    const b = makeBuilder()
    b.onBeforeSubmit((_components, triggers) => {
      if (triggers.length === 0)
        return ['按钮没有触发器']
      return []
    })
    b.addComponent('button', 'btn', { label: '保存' })
    const r = b.submit()
    expect(r.ok).toBe(false)
  })

  it('demo form-completeness scenario: input without $ref value is rejected', () => {
    const b = makeBuilder()
    b.onBeforeSubmit((components) => {
      const errors: string[] = []
      for (const c of components) {
        if (c.type !== 'input')
          continue
        const v = (c.props ?? {}).value
        if (typeof v !== 'string' || !v.startsWith('$ref:')) {
          errors.push(`组件 ${c.name} 的 value 不是 $ref:`)
        }
      }
      return errors
    })
    b.addComponent('input', 'nick', { value: '' }) // empty value, no $
    const r = b.submit()
    expect(r.ok).toBe(false)
  })

  it('happy path: complete draft passes validation', () => {
    const b = makeBuilder()
    b.onBeforeSubmit((components, triggers) => {
      const hasEditable = components.some(c =>
        ['input', 'radio', 'select', 'checkbox'].includes(c.type)
      )
      const hasButton = components.some(c => c.type === 'button')
      if (hasEditable && !hasButton)
        return ['缺按钮']
      if (hasButton && triggers.length === 0)
        return ['按钮没 trigger']
      for (const c of components) {
        if (c.type === 'input') {
          const v = (c.props ?? {}).value
          if (typeof v !== 'string' || !v.startsWith('$ref:'))
            return [`缺 $ref`]
        }
      }
      return []
    })
    b.addComponent('input', 'nick', { value: '$ref:user.nickname' })
    b.addComponent('button', 'btn', { label: '保存' })
    b.addTrigger('button.click', 'btn', 'save', {})
    const r = b.submit()
    expect(r.ok).toBe(true)
  })
})
