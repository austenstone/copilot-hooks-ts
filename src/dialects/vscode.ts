import { z } from "zod";
import {
  type HookDialect,
  type HookEventName,
  has,
  inferEventName,
} from "../events.js";
import type { Dialect } from "./types.js";

// VS Code / Open Plugins (Claude-dialect) snake_case input schemas. Each one
// parses the compat wire payload produced by the runtime's `vsCode*InputMapper`
// functions and `.transform()`s it into the SAME canonical (camelCase) shape the
// native schemas produce, so a handler never has to know which dialect fired.
//
// Only the events that have a distinct compat mapper in the runtime appear here.
// preMcpToolCall, subagentStart, permissionRequest, and notification are always
// delivered natively, so they have no compat schema.

/** Compat timestamp is an ISO string; native is epoch-ms. Normalize to ms. */
const toMs = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
};

const toToolArgs = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
};

const compatBase = {
  hook_event_name: z.string().optional(),
  session_id: z.string(),
  timestamp: z.union([z.string(), z.number()]),
  cwd: z.string(),
};

const base = (input: {
  session_id: string;
  timestamp: string | number;
  cwd: string;
}) => {
  return {
    sessionId: input.session_id,
    timestamp: toMs(input.timestamp),
    cwd: input.cwd,
  };
};

export const sessionStartCompatSchema = z
  .object({
    ...compatBase,
    source: z.string().optional(),
    initial_prompt: z.string().optional(),
  })
  .transform((i) => ({
    ...base(i),
    source: i.source,
    initialPrompt: i.initial_prompt,
  }));

export const sessionEndCompatSchema = z
  .object({ ...compatBase, reason: z.string().optional() })
  .transform((i) => ({ ...base(i), reason: i.reason }));

export const userPromptSubmittedCompatSchema = z
  .object({ ...compatBase, prompt: z.string() })
  .transform((i) => ({ ...base(i), prompt: i.prompt }));

export const preToolUseCompatSchema = z
  .object({
    ...compatBase,
    tool_name: z.string(),
    tool_input: z.unknown(),
  })
  .transform((i) => ({
    ...base(i),
    toolName: i.tool_name,
    toolArgs: toToolArgs(i.tool_input) ?? "",
  }));

export const postToolUseCompatSchema = z
  .object({
    ...compatBase,
    tool_name: z.string(),
    tool_input: z.unknown(),
    // VS Code Copilot Chat sends `tool_response` (a string); the Open Plugins /
    // Claude shape sends `tool_result` (an object). Accept either; neither is
    // required, since a tool can return nothing.
    tool_response: z.string().optional(),
    tool_result: z
      .looseObject({
        result_type: z.string().optional(),
        text_result_for_llm: z.string().optional(),
      })
      .optional(),
  })
  .transform((i) => ({
    ...base(i),
    toolName: i.tool_name,
    toolArgs: toToolArgs(i.tool_input) ?? "",
    toolResult: {
      resultType: i.tool_result?.result_type,
      textResultForLlm: i.tool_result?.text_result_for_llm ?? i.tool_response,
    },
  }));

export const postToolUseFailureCompatSchema = z
  .object({
    ...compatBase,
    tool_name: z.string(),
    tool_input: z.unknown(),
    error: z.string(),
  })
  .transform((i) => ({
    ...base(i),
    toolName: i.tool_name,
    toolArgs: toToolArgs(i.tool_input),
    error: i.error,
  }));

export const errorOccurredCompatSchema = z
  .object({
    ...compatBase,
    error: z.looseObject({
      message: z.string().optional(),
      name: z.string().optional(),
      stack: z.string().optional(),
    }),
    error_context: z.string().optional(),
    recoverable: z.boolean().optional(),
  })
  .transform((i) => ({
    ...base(i),
    error: i.error,
    errorContext: i.error_context,
    recoverable: i.recoverable,
  }));

export const agentStopCompatSchema = z
  .object({
    ...compatBase,
    transcript_path: z.string().optional(),
    stop_reason: z.string().optional(),
  })
  .transform((i) => ({
    ...base(i),
    transcriptPath: i.transcript_path,
    stopReason: i.stop_reason,
  }));

export const subagentStopCompatSchema = z
  .object({
    ...compatBase,
    transcript_path: z.string().optional(),
    agent_name: z.string(),
    agent_display_name: z.string().optional(),
    stop_reason: z.string().optional(),
  })
  .transform((i) => ({
    ...base(i),
    transcriptPath: i.transcript_path,
    agentName: i.agent_name,
    agentDisplayName: i.agent_display_name,
    stopReason: i.stop_reason,
  }));

export const preCompactCompatSchema = z
  .object({
    ...compatBase,
    transcript_path: z.string().optional(),
    trigger: z.string().optional(),
    custom_instructions: z.string().optional(),
  })
  .transform((i) => ({
    ...base(i),
    transcriptPath: i.transcript_path,
    trigger: i.trigger,
    customInstructions: i.custom_instructions,
  }));

export const compatSchemaByEvent: Partial<Record<HookEventName, z.ZodType>> = {
  sessionStart: sessionStartCompatSchema,
  sessionEnd: sessionEndCompatSchema,
  userPromptSubmitted: userPromptSubmittedCompatSchema,
  preToolUse: preToolUseCompatSchema,
  postToolUse: postToolUseCompatSchema,
  postToolUseFailure: postToolUseFailureCompatSchema,
  errorOccurred: errorOccurredCompatSchema,
  agentStop: agentStopCompatSchema,
  subagentStop: subagentStopCompatSchema,
  preCompact: preCompactCompatSchema,
};

// --- Dialect detection ------------------------------------------------------
//
// Everything below is VS Code / Open Plugins specific. The native path never
// touches it: `parseHookInput` only consults these helpers to recognize and
// route a snake_case payload, then normalizes it through the schemas above.

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

/**
 * Detect which wire dialect a payload uses for a given event. A `hook_event_name`
 * field marks the VS Code / Open Plugins dialect — except for notification,
 * which always uses the native (mixed-case) payload, and for events that have no
 * compat mapper in the runtime.
 */
export const detectDialect = (
  payload: Record<string, unknown>,
  event: HookEventName,
): HookDialect => {
  if (!VSCODE_CAPABLE_EVENTS.has(event)) return "native";
  return has(payload, "hook_event_name") ? "vscode" : "native";
};

/**
 * Infer the event for a VS Code payload from its snake_case keys alone. Used as
 * a fallback for the rare compat firing that lacks an explicit `hook_event_name`
 * (native/explicit inference in `inferEventName` covers everything else).
 * Returns undefined when no snake_case event can be determined.
 */
export const inferCompatEvent = (
  payload: Record<string, unknown>,
): HookEventName | undefined => {
  if (has(payload, "notification_type")) return "notification";
  if (has(payload, "tool_name")) {
    if (has(payload, "error")) return "postToolUseFailure";
    if (has(payload, "tool_result") || has(payload, "tool_response"))
      return "postToolUse";
    return "preToolUse";
  }
  if (has(payload, "transcript_path")) return "agentStop";
  return undefined;
};

// --- Dialect ----------------------------------------------------------------

/**
 * The VS Code / Open Plugins surface. Wire payloads are snake_case with an ISO
 * timestamp and an object `tool_input`, discriminated from the native shape by a
 * snake_case `session_id` (native uses camelCase `sessionId`). Each schema
 * `.transform()`s its payload into the canonical camelCase shape, so downstream
 * code never sees snake_case.
 */
export const vscodeDialect: Dialect = {
  name: "vscode",
  detect: (payload) => has(payload, "session_id"),
  inferEvent: (payload) => inferEventName(payload) ?? inferCompatEvent(payload),
  schemaFor: (event) => compatSchemaByEvent[event],
};
