// Output builders. Every Copilot CLI hook decision is a FLAT top-level JSON
// object on stdout — there is no `hookSpecificOutput` wrapper on the native
// path, and the compat path reads flat fields as a fallback, so these builders
// work for BOTH dialects. Emitting nothing means "allow / do nothing".
//
// Which builders a given event consumes (per copilot-agent-runtime
// `hookConfigLoader.ts`):
//   preToolUse          → allowTool / denyTool / askTool / modifyToolArgs / injectContext
//   preMcpToolCall      → setMcpMeta
//   userPromptSubmitted → blockPrompt / modifyPrompt / respond / injectContext / suppressOutput
//   postToolUse         → blockToolResult / modifyToolResult / injectContext / suppressOutput
//   agentStop           → continueAgent
//   subagentStop        → continueAgent
//   postToolUseFailure  → injectContext
//   sessionStart        → injectContext
//   subagentStart       → injectContext
//   notification        → injectContext
//   permissionRequest   → allowPermission / denyPermission
//   sessionEnd / errorOccurred / preCompact → output ignored (observe-only)

export type HookOutput = Record<string, unknown>;

/**
 * Inject hidden context the model will see on its next turn. Consumed by
 * sessionStart, userPromptSubmitted, preToolUse, postToolUse,
 * postToolUseFailure, subagentStart, and notification.
 */
export function injectContext(context: string): HookOutput {
  return { additionalContext: context };
}

/** preToolUse: force-allow the tool, skipping any further permission checks. */
export function allowTool(reason?: string): HookOutput {
  return {
    permissionDecision: "allow",
    ...(reason ? { permissionDecisionReason: reason } : {}),
  };
}

/**
 * preToolUse: BLOCK the tool. This event is fail-closed in the CLI, so a thrown
 * error or nonzero exit also denies — runHooks emits this for you on error.
 */
export function denyTool(reason: string): HookOutput {
  return { permissionDecision: "deny", permissionDecisionReason: reason };
}

/**
 * preToolUse: defer to the normal permission prompt. NOTE: for subprocess
 * (command) hooks the runtime treats "ask" as "deny" because no interactive
 * prompt is available in that path.
 */
export function askTool(reason?: string): HookOutput {
  return {
    permissionDecision: "ask",
    ...(reason ? { permissionDecisionReason: reason } : {}),
  };
}

/**
 * preToolUse: rewrite the tool's arguments before it runs. Pass the new args as
 * a parsed value (object) or a JSON string. Combine with allowTool by spreading
 * if you also want to auto-approve.
 */
export function modifyToolArgs(args: unknown): HookOutput {
  return { modifiedArgs: args };
}

/** preMcpToolCall: replace the outgoing MCP request `_meta` (null clears it). */
export function setMcpMeta(meta: Record<string, unknown> | null): HookOutput {
  return { metaToUse: meta };
}

/** userPromptSubmitted: block the prompt so it never reaches the model. */
export function blockPrompt(reason: string): HookOutput {
  return { decision: "block", reason };
}

/** userPromptSubmitted: rewrite the prompt the model receives. */
export function modifyPrompt(prompt: string): HookOutput {
  return { modifiedPrompt: prompt };
}

/**
 * userPromptSubmitted: fully handle the request, skipping the agent loop and
 * displaying `content` as the assistant's response. `handledBy` is an optional
 * attribution label (e.g. "custom-router").
 */
export function respond(content: string, handledBy?: string): HookOutput {
  return {
    handled: true,
    responseContent: content,
    ...(handledBy ? { handledBy } : {}),
  };
}

/** postToolUse: block (scrub) the tool result and replace it with `reason`. */
export function blockToolResult(reason: string): HookOutput {
  return { decision: "block", reason };
}

/** postToolUse: rewrite the tool result the model receives. */
export function modifyToolResult(result: unknown): HookOutput {
  return { modifiedResult: result };
}

/**
 * agentStop / subagentStop: prevent the agent from stopping and re-prompt it
 * with `reason` (the runtime calls this a "block" decision).
 */
export function continueAgent(reason: string): HookOutput {
  return { decision: "block", reason };
}

/** permissionRequest: allow the pending permission, with an optional message. */
export function allowPermission(message?: string): HookOutput {
  return { behavior: "allow", ...(message ? { message } : {}) };
}

/**
 * permissionRequest: deny the pending permission. `interrupt: true` interrupts
 * the agent rather than just declining the single call.
 */
export function denyPermission(
  message?: string,
  options: { interrupt?: boolean } = {},
): HookOutput {
  return {
    behavior: "deny",
    ...(message ? { message } : {}),
    ...(options.interrupt ? { interrupt: true } : {}),
  };
}

/** Suppress the hook's own stdout from being shown in the transcript/UI. */
export function suppressOutput(): HookOutput {
  return { suppressOutput: true };
}

/**
 * Write a single hook output object as JSON to stdout. Emitting nothing (the
 * default for any handler that returns void/null) means "allow / do nothing".
 */
export function emit(
  output: HookOutput,
  stream: NodeJS.WriteStream = process.stdout,
): void {
  stream.write(JSON.stringify(output));
}
