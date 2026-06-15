import { type HookEventName, toPascalEvent } from "./events.js";

export type HookOutput = Record<string, unknown>;

/**
 * Inject hidden context the model will see. Valid for sessionStart and
 * userPromptSubmitted. The CLI keys the output by the PascalCase event name.
 */
export function injectContext(
  context: string,
  event: HookEventName,
): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: toPascalEvent(event),
      additionalContext: context,
    },
  };
}

/**
 * preToolUse: force-allow the tool, skipping any further permission checks.
 */
export function allowTool(reason?: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  };
}

/**
 * preToolUse: BLOCK the tool. This hook is fail-closed in the CLI, so a thrown
 * error or nonzero exit also denies — prefer returning this explicitly.
 */
export function denyTool(reason: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

/**
 * preToolUse: defer to the user / normal permission prompt.
 */
export function askTool(reason?: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  };
}

/**
 * agentStop: block the agent from stopping and re-prompt it with `reason`.
 * Note the distinct top-level shape (not hookSpecificOutput).
 */
export function blockStop(reason: string): HookOutput {
  return { decision: "block", reason };
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
