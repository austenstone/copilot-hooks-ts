import { z } from "zod";
import type { HookEventName } from "./events.js";

// Schemas anchored to the REAL CLI subprocess stdin wire format (captured from
// live firings), not the @github/copilot-sdk in-process shapes. Notable wire
// facts the SDK types don't reflect:
//   - timestamp is epoch-ms (number), not a Date
//   - the working directory key is `cwd`, not `workingDirectory`
//   - toolArgs is a JSON-ENCODED STRING, not a parsed object
//   - agentStop carries `transcriptPath` (the events.jsonl path)

const baseShape = {
  sessionId: z.string(),
  timestamp: z.number(),
  cwd: z.string(),
};

export const sessionStartSchema = z.object({
  ...baseShape,
  source: z.string().optional(),
  initialPrompt: z.string().optional(),
});

export const userPromptSubmittedSchema = z.object({
  ...baseShape,
  prompt: z.string(),
});

export const toolResultSchema = z.looseObject({
  resultType: z.string().optional(),
  textResultForLlm: z.string().optional(),
});

export const preToolUseSchema = z.object({
  ...baseShape,
  toolName: z.string(),
  toolArgs: z.string(),
});

export const postToolUseSchema = z.object({
  ...baseShape,
  toolName: z.string(),
  toolArgs: z.string(),
  toolResult: toolResultSchema,
});

export const postToolUseFailureSchema = z.object({
  ...baseShape,
  toolName: z.string(),
  // The documented contract only guarantees toolName + error here; keep
  // toolArgs optional so a failure payload that omits it still parses.
  toolArgs: z.string().optional(),
  error: z.string(),
});

export const agentStopSchema = z.object({
  ...baseShape,
  stopReason: z.string().optional(),
  transcriptPath: z.string().optional(),
});

export const schemaByEvent = {
  sessionStart: sessionStartSchema,
  userPromptSubmitted: userPromptSubmittedSchema,
  preToolUse: preToolUseSchema,
  postToolUse: postToolUseSchema,
  postToolUseFailure: postToolUseFailureSchema,
  agentStop: agentStopSchema,
} as const;

type WithEvent<E extends HookEventName, S extends z.ZodType> = z.infer<S> & {
  event: E;
};

export type SessionStartInput = WithEvent<
  "sessionStart",
  typeof sessionStartSchema
>;
export type UserPromptSubmittedInput = WithEvent<
  "userPromptSubmitted",
  typeof userPromptSubmittedSchema
>;
export type PreToolUseInput = WithEvent<"preToolUse", typeof preToolUseSchema>;
export type PostToolUseInput = WithEvent<
  "postToolUse",
  typeof postToolUseSchema
>;
export type PostToolUseFailureInput = WithEvent<
  "postToolUseFailure",
  typeof postToolUseFailureSchema
>;
export type AgentStopInput = WithEvent<"agentStop", typeof agentStopSchema>;

export type HookInput =
  | SessionStartInput
  | UserPromptSubmittedInput
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | AgentStopInput;

export type HookInputFor<E extends HookEventName> = Extract<
  HookInput,
  { event: E }
>;

export type ToolResult = z.infer<typeof toolResultSchema>;
