import type { ToolDef, ToolDefinition, ToolParamDef } from '@triggerix-ai/fn'
import type { BuilderResult, BuiltUI, UIBuilder } from './UIBuilder'
import { defineTools } from '@triggerix-ai/fn'

/**
 * Domain tool —— LLM 可调用的"业务只读工具"。
 *
 * 与 atomic 工具的区别：
 *  - atomic：UI 草稿变更（addComponent / updateComponentProp / addTrigger / clear / submit）
 *  - domain：拉业务动态数据（如 get_options、get_menu），结果作为 tool message 回喂给 LLM
 *
 * Domain 工具不修改 builder。它的返回值会被 dispatcher 包成 `{ ok: true, data }`。
 * 调用方（chat loop）拿到 data 后，把它作为该 tool_call 的 tool result 回喂给 LLM 下一轮。
 *
 * 设计上 domain 是 **协议无关** 的：builder 库只负责把"调用 + 回执"路径打通，
 * 具体怎么读业务数据由调用方的 handler 提供。
 */
export interface DomainTool<TResult = unknown> {
  /** Tool name（与 atomic 工具共享同一工具命名空间，不能重名） */
  name: string
  /** 工具描述，给 LLM 看的 */
  description: string
  /** 参数 schema（与 ToolDef 同形，用 ToolParamDef 描述） */
  params: Record<string, ToolParamDef>
  /**
   * 调用 handler；可以 async。返回任意 JSON-safe 值。
   * 入参是 dispatcher 解码 + 校验后的对象（缺失必填项会在此之前返回错误），
   * 调用方在 handler 内部自行 narrow。
   */
  handler: (args: Record<string, unknown>) => TResult | Promise<TResult>
  /** 并行提示（同 ToolDef.parallel） */
  parallel?: boolean
}

/**
 * Atomic tool 的注册：builder 库只负责**协议**——5 个 atomic schema + domain 工具 dispatch + 通用 prompt。
 *
 * 库本身**不**知道任何具体组件 / 业务 action（这些由调用方提供，格式自由）。
 * 这样 builder 库保持纯抽象，能复用给任何组件库 + 任何业务。
 *
 * 调用方负责：
 *  1. 构造 UIBuilder（可选 setValidTypes 提供白名单，否则 builder 不校验）
 *  2. 拼好 `systemPromptAppendix`（把"可用组件"和"可用 action"清单 markdown 化）
 *  3. 拼好 `domainTools`（业务动态数据源；缺省则 LLM 拿不到运行时数据）
 *  4. 把 def.systemPrompt 喂给 LLM，def.toolDefinitions 喂给 LLM tools 字段
 *  5. AI 调工具时，调 def.executeCall(name, args) 统一派发（atomic → builder / domain → handler）
 *  6. AI 调 submit 后，data 字段返回 BuiltUI，app 自己 mount
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
  /**
   * 可选：domain 工具列表（业务只读数据源）。不传则没有 domain 工具。
   * 调 domain 工具 → handler 返回值 → 通过 executeCall 返回的 `data` 字段流出。
   */
  domainTools?: ReadonlyArray<DomainTool>
}

/**
 * executeCall 的统一返回类型：
 *  - atomic 工具成功：`{ ok: true }`；submit 成功时 `data` 是 BuiltUI
 *  - domain 工具成功：`{ ok: true, data: <handler 返回值> }`
 *  - 失败：`{ ok: false, errors: [...] }`
 *
 * 调用方通过 `data` 是否存在区分"是否需要把数据回喂给 LLM"。
 */
export type ExecuteCallResult
  = | { ok: true, data?: unknown }
    | { ok: false, errors: string[] }

export function defineAtomicTools(
  builder: UIBuilder,
  options: DefineAtomicToolsOptions = {}
): {
  systemPrompt: string
  tools: ReadonlyArray<ToolDef>
  toolDefinitions: ReadonlyArray<ToolDefinition>
  executeCall: (name: string, args: Record<string, unknown>) => Promise<ExecuteCallResult>
} {
  // 注入白名单（builder 内部会校验）。setValidTypes 是幂等的
  builder.setValidTypes({
    componentType: new Set(options.componentTypes ?? []),
    actionType: new Set(options.actionTypes ?? [])
  })

  const componentTypeEnum
    = options.componentTypes && options.componentTypes.length > 0
      ? options.componentTypes
      : undefined
  const actionTypeEnum
    = options.actionTypes && options.actionTypes.length > 0 ? options.actionTypes : undefined

  const atomicTools: ToolDef[] = [
    {
      name: 'addComponent',
      description: '向当前 UI 草稿添加一个原子组件。',
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
      params: {
        name: {
          type: 'string',
          required: true,
          description: '要修改的组件名（与 addComponent 的 name 一致）'
        },
        propName: {
          type: 'string',
          required: true,
          description: '属性名（见组件的 props schema）'
        },
        value: {
          type: 'string',
          required: true,
          // format: 'json' 触发协议层 JSON.parse。LLM 传字符串，dispatcher 解析成实际值（数组/对象/数字/布尔/字符串）。
          // $ref:xxx 是字面字符串例外（直接保留，不 parse）。
          format: 'json',
          description:
            '新值；任意 JSON，序列化成字符串传入（dispatcher 端 JSON.parse）。例：字符串→"hello" / 数字→"42" / 数组→"[\\"a\\",\\"b\\"]" / 对象→\'{"a":1}\'。要引用组件当前值用 "$ref:<componentName>.<path>"，是字面字符串协议，不被 parse。'
        }
      }
    },
    {
      name: 'addTrigger',
      description:
        '为指定组件添加一个事件触发器，绑定到一个业务 action。多次调用同一 (eventType, eventSource) 会自动合并到 sequence。',
      params: {
        eventType: {
          type: 'string',
          required: true,
          description:
            '事件类型（见组件的 events 字段，如 button.click / input.change / radio.change）'
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
          description:
            'action 参数；引用组件值用字符串 "$ref:<componentName>.<path>"（如 "$ref:<name>.value"）'
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
      description: '提交当前 UI 草稿：校验后通过 data 字段返回 BuiltUI。',
      params: {}
    }
  ]

  // domain 工具并入 tools 列表（共享同一 namespace，不能与 atomic 重名）
  const domainToolDefs: ToolDef[] = (options.domainTools ?? []).map(d => ({
    name: d.name,
    description: d.description,
    params: d.params,
    ...(d.parallel ? { parallel: d.parallel } : {})
  }))

  const tools: ToolDef[] = [...atomicTools, ...domainToolDefs]
  const atomicByName = new Map(atomicTools.map(t => [t.name, t]))
  const domainByName = new Map(
    (options.domainTools ?? []).map(d => [d.name, d] as const)
  )

  const systemPrompt = renderProtocolPrompt(
    options.systemPromptAppendix,
    options.domainTools
  )

  async function executeCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<ExecuteCallResult> {
    // domain 优先（不修改 builder，handler 异步返回数据）
    const domain = domainByName.get(name)
    if (domain) {
      const tool = atomicByName.get(name) ?? domainToolDefs.find(t => t.name === name)
      if (tool) {
        const decoded = decodeToolArgs(tool, args)
        if (!decoded.ok)
          return { ok: false, errors: [decoded.error] }
        try {
          const data = await domain.handler(decoded.value)
          return { ok: true, data }
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, errors: [msg] }
        }
      }
    }

    // atomic
    const tool = atomicByName.get(name)
    if (!tool)
      return { ok: false, errors: [`Unknown tool: "${name}"`] }

    const decoded = decodeToolArgs(tool, args)
    if (!decoded.ok)
      return { ok: false, errors: [decoded.error] }

    return dispatchToBuilder(name, decoded.value)
  }

  /**
   * 派发已解码的 args 到对应 builder 方法。builder 信任输入已类型化。
   */
  function dispatchToBuilder(
    name: string,
    args: Record<string, unknown>
  ): ExecuteCallResult {
    switch (name) {
      case 'addComponent': {
        const t = args.type as string
        const n = args.name as string
        const p = args.props as Record<string, unknown> | undefined
        return wrapBuilderResult(builder.addComponent(t, n, p))
      }
      case 'updateComponentProp': {
        const n = args.name as string
        const pn = args.propName as string
        return wrapBuilderResult(builder.updateComponentProp(n, pn, args.value))
      }
      case 'addTrigger': {
        const et = args.eventType as string
        const es = args.eventSource as string
        const at = args.actionType as string
        const ap = (args.actionParams ?? {}) as Record<string, unknown>
        return wrapBuilderResult(builder.addTrigger(et, es, at, ap))
      }
      case 'clear':
        return wrapBuilderResult(builder.clear())
      case 'submit': {
        const r = builder.submit()
        return r.ok
          ? { ok: true, data: r.mountTarget satisfies BuiltUI }
          : { ok: false, errors: r.errors }
      }
      default:
        return { ok: false, errors: [`Unknown atomic tool: "${name}"`] }
    }
  }

  const toolDefinitions = defineTools({ tools, systemPrompt }).tools

  return { systemPrompt, tools, toolDefinitions, executeCall }
}

/**
 * 把 builder 自己的 `{ ok: true } | { ok: false, errors: [...] }` 转成 executeCall 的统一形态。
 */
function wrapBuilderResult(r: BuilderResult): ExecuteCallResult {
  return r.ok ? { ok: true } : { ok: false, errors: r.errors }
}

// ============================================================
// builder 库自带的通用协议提示（不涉及任何具体组件 / 业务）。
// 调用方 systemPromptAppendix 拼在后面，描述自己的组件 / 业务。
// ============================================================

function renderProtocolPrompt(
  appendix?: string,
  domainTools?: ReadonlyArray<DomainTool>
): string {
  const lines: string[] = [
    `你是一个 UI 构造助手。用户的每条需求都是一个意图描述（如"我要修改昵称和性别"），你需要把它转成一个**可交互的 UI 草稿**，让用户直接在 app 里操作。`,
    ``,
    `## 步骤`,
    ``,
    `1. 用 \`addComponent\` 逐个添加 UI 元素（**所有必填 props 一次性传入 props 字段**，不要逐个 updateComponentProp）`,
    `2. 用 \`addTrigger\` 为按钮绑定业务 action`,
    `3. 用 \`submit\` 提交草稿`,
    ``,
    `**不要直接调业务 action 工具** —— 这些 action 只能通过 addTrigger 的 actionType 字段引用，由用户点击按钮触发。`,
    ``,
    `## 完整性原则（最重要）`,
    ``,
    `每个用户意图都是一个**逻辑单元**，必须**完整地**实现它，残缺草稿比没草稿更糟：`,
    ``,
    `- **"修改 X" / "编辑 X" 类意图** → 完整编辑表单：每个待编辑字段 1 个输入控件（input / radio / select / checkbox）+ 1 个提交按钮。`,
    `- **"提交 X" / "确认 X" 类意图** → 提交表单：必要的输入或确认 + 1 个提交按钮。`,
    `- **"查询 X" / "展示 X" 类意图** → 信息展示：label / card 等只读组件。`,
    ``,
    `**用户消息里每个名词/字段在草稿里都必须有对应组件，不能合并、不能省略。**`,
    ``,
    `在 submit 之前做一次自检：**"这个草稿能让用户完成他刚说的事情吗？"**`,
    `不能 → 补组件。能 → submit。submit 时会跑完整性校验（缺组件 / 缺触发器 / 缺 value 都会被拦下，错误信息会指向具体哪里缺）。`,
    ``,
    `## props 一次性传齐`,
    ``,
    `- 必填 props 一次性传给 \`addComponent.props\`，不要先 addComponent 再 updateComponentProp（会浪费 2 倍调用）`,
    `- 不调 updateComponentProp 除非确实需要修改已添加组件的某个 prop`,
    ``,
    `## 组件顺序`,
    ``,
    `addComponent 必须按 **"输入元素 → 操作按钮"** 的顺序调用：先 input / radio / select 等表单控件，最后才是提交 / 取消 / 保存等 button。表单控件在上、按钮在下，符合用户视觉习惯（输入完一眼看到下方的提交按钮）。`,
    ``,
    `## 组件选择指引（按需选择，不是按数量精简）`,
    ``,
    `- 2-4 个互斥选项 → **radio**（直观）`,
    `- 5+ 个选项 → **select**（节省空间）`,
    `- 文本输入 → **input**；多行文本 → input + style 提示（没有 textarea）`,
    `- 提交 / 取消 / 操作按钮 → **button**`,
    `- **不要主动加 label 装饰组件**，但**每个字段都必须有对应的输入控件**，不要因为"看起来简洁"而省略`,
    ``,
    `## 当前态回显（编辑表单的硬要求）`,
    ``,
    `当输入控件表达"用户已有数据"时（编辑/修改/设置场景），\`value\` 字段**必须**用 \`"$ref:user.<field>"\` 字符串引用当前用户态，`,
    `让用户打开表单就看到自己现有的数据，**不要留空**。`,
    `新建场景（没有当前态）才用字面默认值。`,
    ``,
    `## trigger 设计要点`,
    ``,
    `- 一个按钮可以触发**多个** action（多次调 addTrigger，eventType/eventSource 相同 → 自动 sequence 串行执行）`,
    `- actionParams 里要引用组件值时，用字符串 **"$ref:<name>.<path>"**，例：`,
    `  - \`{ <paramKey>: "$ref:<componentName>.value" }\` → 读该组件的当前 .value`,
    `  - \`{ <paramKey>: "$ref:user.<field>" }\` → 读当前用户态字段`,
    `- **不要**写 \`{ $ref: '<name>.<path>' }\` 对象形式（容易漏掉 \`{}\`）`,
    ``,
    `## 工具调用失败时`,
    ``,
    `每个 addComponent / addTrigger 都会校验。失败时返回的错误信息告诉你哪里错了，立即修正后重试。`,
    `submit 也会跑跨组件完整性校验（缺提交按钮、缺 trigger、可编辑字段无 $ref value 等），错误信息直接告诉你缺什么。`,
    ``,
    `## 回复风格`,
    ``,
    `调完工具后只用 1 句话告诉用户接下来做什么（如"好的，请在下方表单修改"）。`,
    `**不要**输出你的推理过程、构造计划、组件清单。thinking 仅用来规划，不展示给用户。`
  ]

  if (domainTools && domainTools.length > 0) {
    lines.push('', '## 可用 domain 工具（业务动态数据源）', '')
    lines.push(
      '这些工具**不修改 UI 草稿**，只返回业务运行时数据（如合法选项列表、当前菜单等）。',
      '需要时**先调** domain 工具拿到数据，再用这些数据构造 UI（比如把 options 填进 radio / select）。',
      ''
    )
    for (const d of domainTools) {
      lines.push(`### \`${d.name}\``, '')
      lines.push(d.description, '')
      const paramEntries = Object.entries(d.params)
      if (paramEntries.length > 0) {
        lines.push('参数：', '')
        for (const [k, v] of paramEntries) {
          const req = v.required ? '**必填**' : '可选'
          const en = v.enum ? ` ∈ {${v.enum.map(x => JSON.stringify(x)).join(', ')}}` : ''
          const t = v.type ? ` (${v.type})` : ''
          lines.push(`  - \`${k}\`${t} ${req}：${v.description ?? ''}${en}`)
        }
        lines.push('')
      }
    }
  }

  if (appendix && appendix.trim().length > 0) {
    lines.push('', '---', '', appendix.trim())
  }
  return lines.join('\n')
}

// ============================================================
// 协议层：tool arg 解码
//
// 协议约定（避免散落在每个 builder 方法里"打补丁"）：
//   - `type: 'string'` 的 param 接受字符串；但 schema 描述里声明 JSON 协议时，
//     会进一步尝试 JSON.parse（用于 updateComponentProp.value 这种"任意 JSON 值"）
//   - `$ref:<name>.<path>` 是字面字符串协议，任何 type 都不能 parse
//   - `type: 'object' / 'array'` 接受原生对象/数组，也接受 JSON-encoded 字符串
//   - 解析失败 → 错误返回 LLM，由 LLM 自行修正
//
// 所有 tool args 在 executeCall 一处统一解码；通过后 builder 信任输入。
// ============================================================

type DecodeResult<T> = { ok: true, value: T } | { ok: false, error: string }

function decodeToolArgs(
  tool: ToolDef,
  raw: Record<string, unknown>
): DecodeResult<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [paramName, paramDef] of Object.entries(tool.params)) {
    const value = raw[paramName]
    if (value === undefined) {
      if (paramDef.required)
        return { ok: false, error: `参数 "${paramName}" 必填` }
      continue
    }
    const r = decodeArg(paramName, value, paramDef)
    if (!r.ok)
      return r
    out[paramName] = r.value
  }
  return { ok: true, value: out }
}

function decodeArg(name: string, raw: unknown, param: ToolDef['params'][string]): DecodeResult<unknown> {
  // $ref 是字面字符串协议 —— 任何 type 都不能 JSON.parse，必须短路
  if (typeof raw === 'string' && raw.startsWith('$ref:')) {
    if (param.type === 'string')
      return { ok: true, value: raw }
    return { ok: false, error: `参数 "${name}" 不能是 $ref 字符串（期望 ${param.type}）` }
  }

  switch (param.type) {
    case 'string':
      // string 类型：保持原样。schema 声明 JSON 协议的（如 value）由 param.format === 'json' 触发 JSON.parse
      if (param.format === 'json' && typeof raw === 'string') {
        return decodeJsonString(name, raw)
      }
      return { ok: true, value: raw }

    case 'number':
    case 'integer': {
      if (typeof raw === 'number')
        return { ok: true, value: raw }
      if (typeof raw === 'string') {
        const n = Number(raw)
        if (!Number.isNaN(n))
          return { ok: true, value: n }
        return { ok: false, error: `参数 "${name}" 必须是 ${param.type}，当前: "${raw.slice(0, 60)}"` }
      }
      return { ok: false, error: `参数 "${name}" 必须是 ${param.type}，收到 ${typeof raw}` }
    }

    case 'boolean':
      if (typeof raw === 'boolean')
        return { ok: true, value: raw }
      return { ok: false, error: `参数 "${name}" 必须是 boolean，收到 ${typeof raw}` }

    case 'array':
      if (Array.isArray(raw))
        return { ok: true, value: raw }
      if (typeof raw === 'string')
        return decodeJsonString(name, raw, 'array')
      return { ok: false, error: `参数 "${name}" 必须是 array，收到 ${typeof raw}` }

    case 'object':
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
        return { ok: true, value: raw }
      if (typeof raw === 'string')
        return decodeJsonString(name, raw, 'object')
      return { ok: false, error: `参数 "${name}" 必须是 object，收到 ${typeof raw}` }

    case 'null':
      return raw === null ? { ok: true, value: null } : { ok: false, error: `参数 "${name}" 必须是 null` }
  }
}

/** 把字符串按 JSON 解析；解析后类型不匹配 expectedType 时报错。 */
function decodeJsonString(
  name: string,
  raw: string,
  expectedType: 'array' | 'object' | 'json' = 'json'
): DecodeResult<unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const preview = raw.length > 80 ? `${raw.slice(0, 80)}...` : raw
    return { ok: false, error: `参数 "${name}" 不是合法 JSON：${msg} | 当前: "${preview}"` }
  }
  if (expectedType === 'array' && !Array.isArray(parsed))
    return { ok: false, error: `参数 "${name}" JSON 解码后不是 array` }
  if (expectedType === 'object' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)))
    return { ok: false, error: `参数 "${name}" JSON 解码后不是 object` }
  return { ok: true, value: parsed }
}
