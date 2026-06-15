import { z } from "zod";
import type { HookEventName } from "./events.js";

// VS Code / Open Plugins (Claude-dialect) snake_case input schemas. Each one
// parses the compat wire payload produced by the runtime's `vsCode*InputMapper`
// functions and `.transform()`s it into the SAME canonical (camelCase) shape the
// native schemas produce, so a handler never has to know which dialect fired.
//
// Only the events that have a distinct compat mapper in the runtime appear here.
// preMcpToolCall, subagentStart, permissionRequest, and notification are always
// delivered natively, so they have no compat schema.

/** Compat timestamp is an ISO string; native is epoch-ms. Normalize to ms. */
function toMs(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function toToolArgs(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

const compatBase = {
  hook_event_name: z.string().optional(),
  session_id: z.string(),
  timestamp: z.union([z.string(), z.number()]),
  cwd: z.string(),
};

function base(input: {
  session_id: string;
  timestamp: string | number;
  cwd: string;
}) {
  return {
    sessionId: input.session_id,
    timestamp: toMs(input.timestamp),
    cwd: input.cwd,
  };
}

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
    tool_result: z.looseObject({
      result_type: z.string().optional(),
      text_result_for_llm: z.string().optional(),
    }),
  })
  .transform((i) => ({
    ...base(i),
    toolName: i.tool_name,
    toolArgs: toToolArgs(i.tool_input) ?? "",
    toolResult: {
      resultType: i.tool_result.result_type,
      textResultForLlm: i.tool_result.text_result_for_llm,
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
