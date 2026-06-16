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
export const injectContext = (context: string): HookOutput => ({
  additionalContext: context,
});

/** preToolUse: force-allow the tool, skipping any further permission checks. */
export const allowTool = (reason?: string): HookOutput => ({
  permissionDecision: "allow",
  ...(reason ? { permissionDecisionReason: reason } : {}),
});

/**
 * preToolUse: BLOCK the tool. This event is fail-closed in the CLI, so a thrown
 * error or nonzero exit also denies — runHooks emits this for you on error.
 */
export const denyTool = (reason: string): HookOutput => ({
  permissionDecision: "deny",
  permissionDecisionReason: reason,
});

/**
 * preToolUse: defer to the normal permission prompt. NOTE: for subprocess
 * (command) hooks the runtime treats "ask" as "deny" because no interactive
 * prompt is available in that path.
 */
export const askTool = (reason?: string): HookOutput => ({
  permissionDecision: "ask",
  ...(reason ? { permissionDecisionReason: reason } : {}),
});

/**
 * preToolUse: rewrite the tool's arguments before it runs. Pass the new args as
 * a parsed value (object) or a JSON string. Combine with allowTool by spreading
 * if you also want to auto-approve.
 */
export const modifyToolArgs = (args: unknown): HookOutput => ({
  modifiedArgs: args,
});

/** preMcpToolCall: replace the outgoing MCP request `_meta` (null clears it). */
export const setMcpMeta = (
  meta: Record<string, unknown> | null,
): HookOutput => ({ metaToUse: meta });

/** userPromptSubmitted: block the prompt so it never reaches the model. */
export const blockPrompt = (reason: string): HookOutput => ({
  decision: "block",
  reason,
});

/** userPromptSubmitted: rewrite the prompt the model receives. */
export const modifyPrompt = (prompt: string): HookOutput => ({
  modifiedPrompt: prompt,
});

/**
 * userPromptSubmitted: fully handle the request, skipping the agent loop and
 * displaying `content` as the assistant's response. `handledBy` is an optional
 * attribution label (e.g. "custom-router").
 */
export const respond = (content: string, handledBy?: string): HookOutput => ({
  handled: true,
  responseContent: content,
  ...(handledBy ? { handledBy } : {}),
});

/** postToolUse: block (scrub) the tool result and replace it with `reason`. */
export const blockToolResult = (reason: string): HookOutput => ({
  decision: "block",
  reason,
});

/** postToolUse: rewrite the tool result the model receives. */
export const modifyToolResult = (result: unknown): HookOutput => ({
  modifiedResult: result,
});

/**
 * agentStop / subagentStop: prevent the agent from stopping and re-prompt it
 * with `reason` (the runtime calls this a "block" decision).
 */
export const continueAgent = (reason: string): HookOutput => ({
  decision: "block",
  reason,
});

/** permissionRequest: allow the pending permission, with an optional message. */
export const allowPermission = (message?: string): HookOutput => ({
  behavior: "allow",
  ...(message ? { message } : {}),
});

/**
 * permissionRequest: deny the pending permission. `interrupt: true` interrupts
 * the agent rather than just declining the single call.
 */
export const denyPermission = (
  message?: string,
  options: { interrupt?: boolean } = {},
): HookOutput => ({
  behavior: "deny",
  ...(message ? { message } : {}),
  ...(options.interrupt ? { interrupt: true } : {}),
});

/** Suppress the hook's own stdout from being shown in the transcript/UI. */
export const suppressOutput = (): HookOutput => ({ suppressOutput: true });

/**
 * Write a single hook output object as JSON to stdout. Emitting nothing (the
 * default for any handler that returns void/null) means "allow / do nothing".
 */
export const emit = (
  output: HookOutput,
  stream: NodeJS.WriteStream = process.stdout,
): void => {
  stream.write(JSON.stringify(output));
};
