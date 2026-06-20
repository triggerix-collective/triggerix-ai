import type { ToolDef, ToolDefinition } from '@triggerix-ai/fn'
import type { BuilderResult, UIBuilder } from './UIBuilder'
import { defineTools } from '@triggerix-ai/fn'

/**
 * Atomic tool 的注册：builder 库只负责**协议**——5 个工具 schema + 通用 prompt 模板。
 *
 * 库本身**不**知道任何具体组件 / 业务 action（这些由调用方提供，格式自由）。
 * 这样 builder 库保持纯抽象，能复用给任何组件库 + 任何业务。
 *
 * 调用方负责：
 *  1. 构造 UIBuilder（可选 setValidTypes 提供白名单，否则 builder 不校验）
 *  2. 拼好 `systemPromptAppendix`（把"可用组件"和"可用 action"清单 markdown 化）
 *  3. 把 def.systemPrompt 喂给 LLM，def.toolDefinitions 喂给 LLM tools 字段
 *  4. AI 调工具时，调 def.executeCall(name, args) 把变更 apply 到 builder
 *  5. AI 调 submit 后，UIBuilder.submit() 返回 BuiltUI，app 自己 mount
 */
export interface DefineAtomicToolsOptions {
  /**
   * 业务侧追加到 builder 通用 prompt 之后的额外内容（组件清单 / action 清单 / 业务知识等）。
   * 不传也能用——AI 不知道有哪些组件 / action，调工具时会全部失败（白名单为空）。
   */
  systemPromptAppendix?: string
  /**
   * 可选：addComponent 工具的 type 参数 enum。传了就约束 LLM；不传则完全开放（白名单为空时所有 addComponent 都会被 builder 拒绝）。
   */
  componentTypes?: string[]
  /**
   * 可选：addTrigger 工具的 actionType 参数 enum。传了就约束 LLM；不传则开放。
   */
  actionTypes?: string[]
}

export function defineAtomicTools(
  builder: UIBuilder,
  options: DefineAtomicToolsOptions = {}
): {
  systemPrompt: string
  tools: ReadonlyArray<ToolDef>
  toolDefinitions: ReadonlyArray<ToolDefinition>
  executeCall: (name: string, args: Record<string, unknown>) => BuilderResult
} {
  // 注入白名单（builder 内部会校验）。setValidTypes 是幂等的
  builder.setValidTypes({
    componentType: new Set(options.componentTypes ?? []),
    actionType: new Set(options.actionTypes ?? [])
  })

  const componentTypeEnum = options.componentTypes && options.componentTypes.length > 0
    ? options.componentTypes
    : undefined
  const actionTypeEnum = options.actionTypes && options.actionTypes.length > 0
    ? options.actionTypes
    : undefined

  const tools: ToolDef[] = [
    {
      name: 'addComponent',
      description: '向当前 UI 草稿添加一个原子组件。',
      parallel: true,
      params: {
        type: {
          type: 'string',
          enum: componentTypeEnum,
          required: true,
          description: '组件类型（见系统提示"可用组件"章节）'
        },
        name: {
          type: 'string',
          required: true,
          description: '组件实例的语义化名称（同一次草稿内必须唯一，trigger 用它引用）'
        },
        props: {
          type: 'object',
          description: '组件属性对象（字段见该组件的 props schema）'
        }
      }
    },
    {
      name: 'updateComponentProp',
      description: '修改已添加组件的某个属性值。',
      parallel: true,
      params: {
        name: { type: 'string', required: true, description: '要修改的组件名（与 addComponent 的 name 一致）' },
        propName: { type: 'string', required: true, description: '属性名（见组件的 props schema）' },
        value: { type: 'string', required: true, description: '新值；任意 JSON，序列化成字符串后传入。例: 字符串→"hello" / 数字→"42" / 数组→"[1,2]" / 对象→\'{"a":1}\'。demo 端会 JSON.parse。' }
      }
    },
    {
      name: 'addTrigger',
      description: '为指定组件添加一个事件触发器，绑定到一个业务 action。多次调用同一 (eventType, eventSource) 会自动合并到 sequence。',
      parallel: true,
      params: {
        eventType: {
          type: 'string',
          required: true,
          description: '事件类型（见组件的 events 字段，如 button.click / input.change / radio.change）'
        },
        eventSource: {
          type: 'string',
          required: true,
          description: '事件源组件名（与 addComponent 的 name 一致）'
        },
        actionType: {
          type: 'string',
          enum: actionTypeEnum,
          required: true,
          description: '业务 action（见系统提示"可用 action"章节）'
        },
        actionParams: {
          type: 'object',
          description: 'action 参数；引用组件值用字符串 "$ref:<componentName>.<path>"（如 "$ref:nick.value"）'
        }
      }
    },
    {
      name: 'clear',
      description: '清空当前 UI 草稿（从头开始）。',
      params: {}
    },
    {
      name: 'submit',
      description: '提交当前 UI 草稿：校验后挂载到对话气泡。',
      params: {}
    }
  ]

  const systemPrompt = renderProtocolPrompt(options.systemPromptAppendix)

  function executeCall(name: string, args: Record<string, unknown>): BuilderResult {
    switch (name) {
      case 'addComponent': {
        const t = asString(args.type)
        const n = asString(args.name)
        const p = (args.props && typeof args.props === 'object' ? args.props : undefined) as
          | Record<string, unknown>
          | undefined
        return builder.addComponent(t, n, p)
      }
      case 'updateComponentProp': {
        const n = asString(args.name)
        const pn = asString(args.propName)
        return builder.updateComponentProp(n, pn, args.value)
      }
      case 'addTrigger': {
        const et = asString(args.eventType)
        const es = asString(args.eventSource)
        const at = asString(args.actionType)
        const ap = (args.actionParams && typeof args.actionParams === 'object' ? args.actionParams : {}) as Record<string, unknown>
        return builder.addTrigger(et, es, at, ap)
      }
      case 'clear':
        return builder.clear()
      case 'submit': {
        const r = builder.submit()
        return r.ok ? { ok: true } : { ok: false, errors: r.errors }
      }
      default:
        return { ok: false, errors: [`Unknown tool: "${name}"`] }
    }
  }

  const toolDefinitions = defineTools({ tools, systemPrompt }).tools

  return { systemPrompt, tools, toolDefinitions, executeCall }
}

// ============================================================
// builder 库自带的通用协议提示（不涉及任何具体组件 / 业务）。
// 调用方 systemPromptAppendix 拼在后面，描述自己的组件 / 业务。
// ============================================================

function renderProtocolPrompt(appendix?: string): string {
  const lines: string[] = [
    `你是一个 UI 构造助手。用户的每条需求都是一个意图描述（如"我要修改昵称和性别"），你需要把它转成一个**可交互的 UI 草稿**，让用户直接在 app 里操作。`,
    ``,
    `## 步骤`,
    ``,
    `1. 用 \`addComponent\` 逐个添加 UI 元素`,
    `2. 用 \`addTrigger\` 为按钮或输入框绑定业务 action`,
    `3. 用 \`submit\` 提交草稿`,
    ``,
    `**不要直接调业务 action 工具** —— 这些 action 只能通过 addTrigger 的 actionType 字段引用，由用户点击按钮触发。`,
    ``,
    `## trigger 设计要点`,
    ``,
    `- 一个按钮可以触发**多个** action（多次调 addTrigger，eventType/eventSource 相同 → 自动 sequence 串行执行）`,
    `- actionParams 里要引用组件值时，用字符串 **"$ref:<name>.<path>"**，例：`,
    `  - \`{ nickname: "$ref:nick.value" }\` → 读 nick 这个 input 的 .value`,
    `  - \`{ gender: "$ref:gen.value" }\` → 读 gen 这个 radio 的 .value`,
    `- **不要**写 \`{ $ref: 'nick.value' }\` 对象形式（容易漏掉 \`{}\`）`,
    ``,
    `## 工具调用失败时`,
    ``,
    `每个 addComponent / addTrigger 都会校验。失败时返回的错误信息告诉你哪里错了，立即修正后重试。`
  ]
  if (appendix && appendix.trim().length > 0) {
    lines.push('', '---', '', appendix.trim())
  }
  return lines.join('\n')
}

function asString(v: unknown): string {
  if (typeof v === 'string')
    return v
  if (v == null)
    return ''
  if (typeof v === 'number' || typeof v === 'boolean')
    return String(v)
  return JSON.stringify(v)
}
