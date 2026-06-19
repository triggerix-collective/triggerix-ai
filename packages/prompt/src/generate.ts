import type { AIComponentDef, ComponentRegistry } from '@triggerix-ai/component'
import type { AIActionDef, AIConditionDef, AIEventDef, AIRegistry, ParamSchema } from '@triggerix-ai/registry'
import { BASE_SYSTEM_PROMPT } from './base'

/** Options for `generateSystemPrompt`. */
export interface GenerateSystemPromptOptions {
  registry: AIRegistry
  /** When provided, switches the prompt to component-generation mode. */
  component?: ComponentRegistry
}

function formatParams(params: Record<string, ParamSchema> | undefined): string {
  if (!params)
    return ''
  const entries = Object.entries(params)
  if (entries.length === 0)
    return ''
  return entries
    .map(([name, p]) => {
      const parts = [`${name}: ${p.type}`]
      if (p.enum)
        parts.push(`enum=${JSON.stringify(p.enum)}`)
      if (p.required)
        parts.push('required')
      return parts.join(', ')
    })
    .join('; ')
}

/**
 * Format an item with the standard "id: description (params: ...) [Guidance: ...]"
 * shape used by both events and actions.
 */
function formatCatalogItem(item: { id: string, description: string, prompt?: string, params?: Record<string, ParamSchema> }): string {
  const params = formatParams(item.params)
  const head = `- \`${item.id}\`: ${item.description}`
  const tail = item.prompt ? `\n  - Guidance: ${item.prompt}` : ''
  return params ? `${head} (params: ${params})${tail}` : `${head}${tail}`
}

function formatEvent(e: AIEventDef): string {
  return formatCatalogItem(e)
}

function formatAction(a: AIActionDef): string {
  return formatCatalogItem(a)
}

function formatCondition(c: AIConditionDef): string {
  return c.prompt
    ? `- \`${c.id}\`: ${c.description}\n  - Guidance: ${c.prompt}`
    : `- \`${c.id}\`: ${c.description}`
}

function formatComponent(c: AIComponentDef): string {
  const lines: string[] = [`- \`${c.type}\` (${c.label}): ${c.description}`]
  if (c.container)
    lines.push('  - Container: can have children')
  const props = formatParams(c.props)
  if (props)
    lines.push(`  - Props: ${props}`)
  if (c.events?.length) {
    lines.push(`  - Emits: ${c.events.map(id => `\`${id}\``).join(', ')}`)
  }
  if (c.prompt)
    lines.push(`  - Guidance: ${c.prompt}`)
  return lines.join('\n')
}

/**
 * Build a complete system prompt by concatenating the static protocol spec
 * with dynamic sections listing registered events / actions / components.
 */
export function generateSystemPrompt(options: GenerateSystemPromptOptions): string {
  const { registry, component } = options
  const sections: string[] = [BASE_SYSTEM_PROMPT]

  const events = registry.getEvents()
  if (events.length) {
    sections.push('## Available Events', events.map(formatEvent).join('\n'))
  }

  const actions = registry.getActions()
  if (actions.length) {
    sections.push('## Available Actions', actions.map(formatAction).join('\n'))
  }

  const conditions = registry.getConditions()
  if (conditions.length) {
    sections.push('## Available Conditions', conditions.map(formatCondition).join('\n'))
  }

  if (component) {
    const components = component.getComponents()
    if (components.length) {
      sections.push(
        '## Available Components',
        'Pick components from this catalog. You are free to combine and nest them as the user intent requires — there are no preset layouts.',
        components.map(formatComponent).join('\n')
      )

      // Reverse index: component → events. Helps the LLM decide which
      // `event.source` (component `name`) can fire which event.
      const componentEventMap: Record<string, string[]> = {}
      for (const c of components) {
        if (c.events?.length)
          componentEventMap[c.type] = c.events
      }
      if (Object.keys(componentEventMap).length) {
        sections.push(
          '## Component → Event Map',
          'Use this to decide which `event.source` (i.e. component `name`) can fire which event.',
          Object.entries(componentEventMap)
            .map(([type, evs]) => `- \`${type}\` → ${evs.map(e => `\`${e}\``).join(', ')}`)
            .join('\n')
        )
      }
    }
  }

  return `${sections.join('\n\n')}\n`
}
