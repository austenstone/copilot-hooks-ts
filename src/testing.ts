// Test harness for hook authors. `runHooks` already accepts `{ stream, out }`
// purely so it can be driven in a test; this wraps that plumbing so a hook test
// is one call — no Readable/Writable wiring, no hand-built wire payloads, no
// rediscovering the sharp edges (epoch-ms timestamp, JSON-string toolArgs, the
// no-event-name-field inference). Build a friendly spec, run the real dispatch
// path, get the parsed decision back (or undefined for allow / no-op).

import { Readable, Writable } from "node:stream";
import type { HookEventName } from "./events.js";
import type { HookOutput } from "./output.js";
import { type HookHandlers, type RunHooksOptions, runHooks } from "./runner.js";

/**
 * A friendly description of a hook firing. Only `event` is required — every
 * other field is filled with a sensible default that infers to that event and
 * passes schema validation. Pass `toolInput` (a plain object) for tool events
 * and it's encoded to the right wire field for you (`toolArgs` JSON string for
 * pre/postToolUse, `arguments` for preMcpToolCall, `toolInput` for
 * permissionRequest). Any other field overrides its default verbatim.
 */
export interface HookPayloadSpec {
  event: HookEventName;
  sessionId?: string;
  timestamp?: number;
  cwd?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  [key: string]: unknown;
}

// Per-event defaults chosen so each payload (a) infers to its event via
// inferEventName, and (b) satisfies the native zod schema. Override any field
// through the spec.
const DEFAULTS: Record<HookEventName, Record<string, unknown>> = {
  sessionStart: { source: "startup", initialPrompt: "test prompt" },
  sessionEnd: { reason: "completed" },
  userPromptSubmitted: { prompt: "test prompt" },
  preToolUse: { toolName: "bash", toolArgs: '{"command":"echo hi"}' },
  preMcpToolCall: {
    serverName: "test-server",
    toolName: "test_tool",
    arguments: {},
  },
  postToolUse: {
    toolName: "bash",
    toolArgs: '{"command":"echo hi"}',
    toolResult: { resultType: "success", textResultForLlm: "ok" },
  },
  postToolUseFailure: {
    toolName: "bash",
    toolArgs: '{"command":"echo hi"}',
    error: "command failed",
  },
  errorOccurred: {
    error: { message: "something failed" },
    errorContext: "test",
  },
  agentStop: { transcriptPath: "/tmp/events.jsonl", stopReason: "end_turn" },
  subagentStop: { agentName: "test-subagent", stopReason: "end_turn" },
  subagentStart: {
    agentName: "test-subagent",
    agentDescription: "a test subagent",
  },
  preCompact: { trigger: "auto", customInstructions: "" },
  permissionRequest: {
    toolName: "bash",
    toolInput: { command: "echo hi" },
    permissionSuggestions: [{ kind: "allowOnce" }],
  },
  notification: { message: "test notification", notificationType: "info" },
};

const TOOL_ARGS_EVENTS = new Set<HookEventName>([
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
]);

/**
 * Build a canonical native (camelCase) wire payload from a friendly spec — the
 * same shape the CLI writes to a hook's stdin. Useful on its own to feed a real
 * hook script (e.g. `echo "$(payload)" | npx tsx my-hook.ts`).
 */
export const buildHookPayload = (
  spec: HookPayloadSpec,
): Record<string, unknown> => {
  const { event, toolInput, ...rest } = spec;
  const payload: Record<string, unknown> = {
    sessionId: "test-session",
    timestamp: 1739550000000,
    cwd: "/repo",
    ...DEFAULTS[event],
    ...rest,
  };

  if (toolInput !== undefined) {
    if (TOOL_ARGS_EVENTS.has(event)) {
      payload.toolArgs = JSON.stringify(toolInput);
      delete payload.toolInput;
    } else if (event === "preMcpToolCall") {
      payload.arguments = toolInput;
    } else {
      payload.toolInput = toolInput;
    }
  }

  return payload;
};

export interface TestHookOptions
  extends Pick<RunHooksOptions, "onError" | "failClosed" | "shouldRun"> {
  /** Override the payload after it's built from the spec (escape hatch). */
  payload?: Record<string, unknown>;
}

/**
 * Drive `handlers` with a single synthetic firing and return the parsed stdout
 * decision — or `undefined` when the hook emitted nothing (allow / no-op).
 *
 * ```ts
 * const out = await testHook(handlers, {
 *   event: "preToolUse",
 *   toolName: "bash",
 *   toolInput: { command: "rm -rf /" },
 * });
 * expect(out).toEqual({ permissionDecision: "deny", permissionDecisionReason: "nope" });
 * ```
 *
 * Goes through the real `runHooks` path, so dialect detection, zod validation,
 * tool-scoped maps, and fail-closed behavior all apply exactly as in production.
 * The process exit code is left untouched (a fail-closed deny still emits its
 * decision, which you'll see in the return value).
 */
export const testHook = async (
  handlers: HookHandlers,
  spec: HookPayloadSpec,
  options: TestHookOptions = {},
): Promise<HookOutput | undefined> => {
  const { payload: override, ...runOptions } = options;
  const payload = override ?? buildHookPayload(spec);

  let buf = "";
  const out = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  const stream = Readable.from([JSON.stringify(payload)]);

  await runHooks(handlers, {
    ...runOptions,
    stream: stream as unknown as NodeJS.ReadStream,
    out: out as unknown as NodeJS.WriteStream,
    setExitCode: () => {},
  });

  return buf ? (JSON.parse(buf) as HookOutput) : undefined;
};
