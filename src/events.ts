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

export const isHookEventName = (value: string): value is HookEventName =>
  (HOOK_EVENTS as readonly string[]).includes(value);

/** Map an explicit event-name field (either dialect) to a canonical event. */
export const fromExplicitName = (raw: unknown): HookEventName | undefined => {
  if (typeof raw !== "string") return undefined;
  if (PASCAL_TO_EVENT[raw]) return PASCAL_TO_EVENT[raw];
  const camel = raw.charAt(0).toLowerCase() + raw.slice(1);
  return isHookEventName(camel) ? camel : undefined;
};

export const has = (payload: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(payload, key);

/**
 * Infer which event a native (camelCase) stdin payload represents. Native
 * firings carry no event-name field, so the event is derived from which keys are
 * present; an explicit `hook_event_name`/`hookEventName` (either dialect) is
 * honored first. Returns undefined when no native event can be determined —
 * callers fall back to {@link inferCompatEvent} for snake_case-only payloads.
 */
export const inferEventName = (
  payload: Record<string, unknown>,
): HookEventName | undefined => {
  const explicit =
    fromExplicitName(payload.hook_event_name) ??
    fromExplicitName(payload.hookEventName);
  if (explicit) return explicit;

  if (
    has(payload, "permissionSuggestions") ||
    payload.hookName === "permissionRequest"
  )
    return "permissionRequest";
  if (has(payload, "notificationType")) return "notification";
  if (has(payload, "serverName")) return "preMcpToolCall";
  if (has(payload, "agentDescription")) return "subagentStart";
  if (has(payload, "agentName")) return "subagentStop";
  if (has(payload, "trigger") && has(payload, "customInstructions"))
    return "preCompact";
  if (has(payload, "errorContext")) return "errorOccurred";

  if (has(payload, "toolName")) {
    if (has(payload, "error")) return "postToolUseFailure";
    if (has(payload, "toolResult")) return "postToolUse";
    return "preToolUse";
  }

  if (has(payload, "prompt")) return "userPromptSubmitted";
  if (has(payload, "transcriptPath")) return "agentStop";
  if (has(payload, "reason")) return "sessionEnd";
  if (has(payload, "source") || has(payload, "initialPrompt"))
    return "sessionStart";
  return undefined;
};
