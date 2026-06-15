// The six GitHub Copilot CLI subprocess hook events.
//
// These are the events the CLI fires by spawning a script wired in hooks.json.
// They are NOT identical to the @github/copilot-sdk in-process SessionHooks
// (which has no agentStop). This list is the subprocess surface.

export const HOOK_EVENTS = [
  "sessionStart",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "agentStop",
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];

const PASCAL_BY_EVENT: Record<HookEventName, string> = {
  sessionStart: "SessionStart",
  userPromptSubmitted: "UserPromptSubmitted",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  postToolUseFailure: "PostToolUseFailure",
  agentStop: "AgentStop",
};

/**
 * The hooks.json wiring keys are camelCase (preToolUse), but the
 * `hookSpecificOutput.hookEventName` field the CLI expects in stdout is
 * PascalCase (PreToolUse). This maps wiring name -> output name.
 */
export function toPascalEvent(event: HookEventName): string {
  return PASCAL_BY_EVENT[event];
}

function normalizeEventName(raw: string): HookEventName | undefined {
  const camel = raw.charAt(0).toLowerCase() + raw.slice(1);
  return (HOOK_EVENTS as readonly string[]).includes(camel)
    ? (camel as HookEventName)
    : undefined;
}

/**
 * Infer which event a stdin payload represents. Real CLI firings carry NO
 * hookEventName field, so the event is derived from which keys are present
 * (per the documented wire contract). An explicit hookEventName is honored
 * when present, for forward-compatibility.
 */
export function inferEventName(
  payload: Record<string, unknown>,
): HookEventName | undefined {
  const explicit = payload.hookEventName;
  if (typeof explicit === "string") {
    const normalized = normalizeEventName(explicit);
    if (normalized) return normalized;
  }
  if ("stopReason" in payload || "transcriptPath" in payload)
    return "agentStop";
  if ("toolName" in payload) {
    if ("error" in payload) return "postToolUseFailure";
    if ("toolResult" in payload) return "postToolUse";
    return "preToolUse";
  }
  if ("prompt" in payload) return "userPromptSubmitted";
  if ("initialPrompt" in payload || "source" in payload) return "sessionStart";
  return undefined;
}
