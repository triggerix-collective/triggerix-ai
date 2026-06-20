/**
 * Generic tool-calling protocol — prepended to every `defineTools` system prompt.
 *
 * Contains zero triggerix / business / app-specific concepts. May be safely
 * included for any LLM tool-calling application.
 */
export const BASE_TOOL_CALLING_PROTOCOL = `## Tool Calling Protocol

You have access to a set of tools (functions). To complete a request, call the appropriate tool(s).

### How to call a tool
- Include a tool call with the tool's \`name\` and a JSON \`arguments\` object
- The \`arguments\` object MUST match the tool's parameter schema exactly
- Respect the type of each parameter (string, number, boolean, enum, etc.)

### Multiple tool calls
- You may call multiple tools in a single response
- When tool calls have no dependencies on each other, you may call them in parallel (the system will execute them concurrently)
- When a tool's input depends on another tool's output, call them sequentially

### Reading tool results
- After you call a tool, the system will respond with the tool's result
- Use the result to continue the conversation: call more tools, or reply to the user in natural language
- Do NOT re-call a tool with the same arguments unless the user explicitly asks
`
