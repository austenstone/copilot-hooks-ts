// The 14 GitHub Copilot CLI subprocess hook events.
//
// Source of truth: copilot-agent-runtime `src/core/hooks.ts` (QueryHooks) and
// `src/core/hookConfigLoader.ts` (the wire serialization). These are the events
// the CLI fires by spawning a script wired in hooks.json.

export const HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "preMcpToolCall",
  "postToolUse",
  "postToolUseFailure",
  "errorOccurred",
  "agentStop",
  "subagentStop",
  "subagentStart",
  "preCompact",
  "permissionRequest",
  "notification",
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];

export type HookDialect = "native" | "vscode";

/**
 * PascalCase aliases (VS Code / Open Plugins / Claude dialect) → canonical
 * camelCase event names. Mirrors `hookEventNameAliases` in the runtime. Note the
 * non-obvious mappings: `UserPromptSubmit` → `userPromptSubmitted`, `Stop` →
 * `agentStop`.
 */
export const PASCAL_TO_EVENT: Record<string, HookEventName> = {
  SessionStart: "sessionStart",
  SessionEnd: "sessionEnd",
  UserPromptSubmit: "userPromptSubmitted",
  PreToolUse: "preToolUse",
  PreMcpToolCall: "preMcpToolCall",
  PostToolUse: "postToolUse",
  PostToolUseFailure: "postToolUseFailure",
  ErrorOccurred: "errorOccurred",
  Stop: "agentStop",
  SubagentStop: "subagentStop",
  SubagentStart: "subagentStart",
  PreCompact: "preCompact",
  PermissionRequest: "permissionRequest",
  Notification: "notification",
};

export const EVENT_TO_PASCAL: Record<HookEventName, string> =
  Object.fromEntries(
    Object.entries(PASCAL_TO_EVENT).map(([pascal, camel]) => [camel, pascal]),
  ) as Record<HookEventName, string>;

/**
 * Events whose stdout decision the runtime actually reads and acts on.
 */
export const DECISION_EVENTS = [
  "preToolUse",
  "preMcpToolCall",
  "postToolUse",
  "userPromptSubmitted",
  "agentStop",
  "subagentStop",
  "permissionRequest",
] as const;

/**
 * Events whose only consumed output is `additionalContext`.
 */
export const CONTEXT_ONLY_EVENTS = [
  "sessionStart",
  "postToolUseFailure",
  "subagentStart",
  "notification",
] as const;

/**
 * Events whose stdout is ignored entirely — observe-only.
 */
export const OBSERVE_ONLY_EVENTS = [
  "sessionEnd",
  "errorOccurred",
  "preCompact",
] as const;

/**
 * preToolUse and permissionRequest are fail-closed in the runtime: a thrown
 * error or nonzero exit denies the action. runHooks defaults to emitting an
 * explicit deny for these on handler error.
 */
export const FAIL_CLOSED_EVENTS = ["preToolUse", "permissionRequest"] as const;

/**
 * Events that have a distinct VS Code / Open Plugins snake_case wire payload.
 * preMcpToolCall, subagentStart, permissionRequest, and notification are always
 * delivered in the native camelCase shape regardless of hooks.json key casing.
 */
const VSCODE_CAPABLE_EVENTS = new Set<HookEventName>([
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "errorOccurred",
  "agentStop",
  "subagentStop",
  "preCompact",
]);

function isHookEventName(value: string): value is HookEventName {
  return (HOOK_EVENTS as readonly string[]).includes(value);
}

/** Map an explicit event-name field (either dialect) to a canonical event. */
function fromExplicitName(raw: unknown): HookEventName | undefined {
  if (typeof raw !== "string") return undefined;
  if (PASCAL_TO_EVENT[raw]) return PASCAL_TO_EVENT[raw];
  const camel = raw.charAt(0).toLowerCase() + raw.slice(1);
  return isHookEventName(camel) ? camel : undefined;
}

function has(payload: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(payload, key);
}

/**
 * Infer which event a stdin payload represents. Compat (VS Code) and
 * notification payloads carry `hook_event_name`; native payloads carry no event
 * field, so the event is derived from which keys are present. Returns undefined
 * when no event can be determined.
 */
export function inferEventName(
  payload: Record<string, unknown>,
): HookEventName | undefined {
  const explicit =
    fromExplicitName(payload.hook_event_name) ??
    fromExplicitName(payload.hookEventName);
  if (explicit) return explicit;

  if (
    has(payload, "permissionSuggestions") ||
    payload.hookName === "permissionRequest"
  )
    return "permissionRequest";
  if (has(payload, "notificationType") || has(payload, "notification_type"))
    return "notification";
  if (has(payload, "serverName")) return "preMcpToolCall";
  if (has(payload, "agentDescription")) return "subagentStart";
  if (has(payload, "agentName")) return "subagentStop";
  if (has(payload, "trigger") && has(payload, "customInstructions"))
    return "preCompact";
  if (has(payload, "errorContext")) return "errorOccurred";

  const toolName = has(payload, "toolName") || has(payload, "tool_name");
  if (toolName) {
    if (has(payload, "error")) return "postToolUseFailure";
    if (has(payload, "toolResult") || has(payload, "tool_result"))
      return "postToolUse";
    return "preToolUse";
  }

  if (has(payload, "prompt")) return "userPromptSubmitted";
  if (has(payload, "transcriptPath") || has(payload, "transcript_path"))
    return "agentStop";
  if (has(payload, "reason")) return "sessionEnd";
  if (has(payload, "source") || has(payload, "initialPrompt"))
    return "sessionStart";
  return undefined;
}

/**
 * Detect which wire dialect a payload uses for a given event. A `hook_event_name`
 * field marks the VS Code / Open Plugins dialect — except for notification,
 * which always uses the native (mixed-case) payload, and for events that have no
 * compat mapper in the runtime.
 */
export function detectDialect(
  payload: Record<string, unknown>,
  event: HookEventName,
): HookDialect {
  if (!VSCODE_CAPABLE_EVENTS.has(event)) return "native";
  return has(payload, "hook_event_name") ? "vscode" : "native";
}
