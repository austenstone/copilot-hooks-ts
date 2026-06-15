import { z } from "zod";
import type { HookDialect, HookEventName } from "./events.js";

// Native (camelCase) input schemas, anchored to the real CLI subprocess wire
// format produced by copilot-agent-runtime's native input mappers
// (`hookConfigLoader.ts`). Notable facts the in-process SDK types don't reflect:
//   - timestamp is epoch-ms (number)
//   - the working directory key is `cwd`, not `workingDirectory`
//   - preToolUse/postToolUse `toolArgs` is a JSON-ENCODED STRING
//   - stop/subagent/compact events carry `transcriptPath`
//
// The VS Code / Open Plugins snake_case dialect is normalized into these same
// shapes in `compat.ts`, so handlers always see one canonical input.

const baseShape = {
  sessionId: z.string(),
  timestamp: z.number(),
  cwd: z.string(),
};

/** toolArgs is a JSON string on the wire; tolerate non-strings by encoding. */
const toolArgs = z
  .unknown()
  .transform((v) =>
    typeof v === "string" ? v : v === undefined ? undefined : JSON.stringify(v),
  );

export const sessionStartSchema = z.object({
  ...baseShape,
  source: z.string().optional(),
  initialPrompt: z.string().optional(),
});

export const sessionEndSchema = z.object({
  ...baseShape,
  reason: z.string().optional(),
  finalMessage: z.string().optional(),
});

export const userPromptSubmittedSchema = z.object({
  ...baseShape,
  prompt: z.string(),
});

export const preToolUseSchema = z.object({
  ...baseShape,
  toolName: z.string(),
  toolArgs: toolArgs,
});

export const preMcpToolCallSchema = z.object({
  ...baseShape,
  toolCallId: z.string().optional(),
  serverName: z.string(),
  toolName: z.string(),
  arguments: z.unknown(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export const toolResultSchema = z.looseObject({
  resultType: z.string().optional(),
  textResultForLlm: z.string().optional(),
});

export const postToolUseSchema = z.object({
  ...baseShape,
  toolName: z.string(),
  toolArgs: toolArgs,
  toolResult: toolResultSchema,
});

export const postToolUseFailureSchema = z.object({
  ...baseShape,
  toolName: z.string(),
  toolArgs: toolArgs.optional(),
  error: z.string(),
});

export const errorOccurredSchema = z.object({
  ...baseShape,
  error: z.looseObject({
    message: z.string().optional(),
    name: z.string().optional(),
    stack: z.string().optional(),
  }),
  errorContext: z.string().optional(),
  recoverable: z.boolean().optional(),
});

export const agentStopSchema = z.object({
  ...baseShape,
  transcriptPath: z.string().optional(),
  stopReason: z.string().optional(),
});

export const subagentStopSchema = z.object({
  ...baseShape,
  transcriptPath: z.string().optional(),
  agentName: z.string(),
  agentDisplayName: z.string().optional(),
  stopReason: z.string().optional(),
});

export const subagentStartSchema = z.object({
  ...baseShape,
  transcriptPath: z.string().optional(),
  agentName: z.string(),
  agentDisplayName: z.string().optional(),
  agentDescription: z.string().optional(),
});

export const preCompactSchema = z.object({
  ...baseShape,
  transcriptPath: z.string().optional(),
  trigger: z.string().optional(),
  customInstructions: z.string().optional(),
});

export const permissionRequestSchema = z.object({
  ...baseShape,
  hookName: z.string().optional(),
  toolName: z.string(),
  toolInput: z.unknown(),
  permissionSuggestions: z
    .array(z.looseObject({ kind: z.string() }))
    .optional(),
});

export const notificationSchema = z.object({
  ...baseShape,
  message: z.string(),
  title: z.string().optional(),
  notificationType: z.string().optional(),
});

export const nativeSchemaByEvent = {
  sessionStart: sessionStartSchema,
  sessionEnd: sessionEndSchema,
  userPromptSubmitted: userPromptSubmittedSchema,
  preToolUse: preToolUseSchema,
  preMcpToolCall: preMcpToolCallSchema,
  postToolUse: postToolUseSchema,
  postToolUseFailure: postToolUseFailureSchema,
  errorOccurred: errorOccurredSchema,
  agentStop: agentStopSchema,
  subagentStop: subagentStopSchema,
  subagentStart: subagentStartSchema,
  preCompact: preCompactSchema,
  permissionRequest: permissionRequestSchema,
  notification: notificationSchema,
} as const satisfies Record<HookEventName, z.ZodType>;

/** Fields every parsed input carries on top of the per-event wire fields. */
export interface HookMeta<E extends HookEventName> {
  event: E;
  dialect: HookDialect;
}

type WithMeta<E extends HookEventName, S extends z.ZodType> = z.infer<S> &
  HookMeta<E>;

export type SessionStartInput = WithMeta<
  "sessionStart",
  typeof sessionStartSchema
>;
export type SessionEndInput = WithMeta<"sessionEnd", typeof sessionEndSchema>;
export type UserPromptSubmittedInput = WithMeta<
  "userPromptSubmitted",
  typeof userPromptSubmittedSchema
>;
export type PreToolUseInput = WithMeta<"preToolUse", typeof preToolUseSchema>;
export type PreMcpToolCallInput = WithMeta<
  "preMcpToolCall",
  typeof preMcpToolCallSchema
>;
export type PostToolUseInput = WithMeta<
  "postToolUse",
  typeof postToolUseSchema
>;
export type PostToolUseFailureInput = WithMeta<
  "postToolUseFailure",
  typeof postToolUseFailureSchema
>;
export type ErrorOccurredInput = WithMeta<
  "errorOccurred",
  typeof errorOccurredSchema
>;
export type AgentStopInput = WithMeta<"agentStop", typeof agentStopSchema>;
export type SubagentStopInput = WithMeta<
  "subagentStop",
  typeof subagentStopSchema
>;
export type SubagentStartInput = WithMeta<
  "subagentStart",
  typeof subagentStartSchema
>;
export type PreCompactInput = WithMeta<"preCompact", typeof preCompactSchema>;
export type PermissionRequestInput = WithMeta<
  "permissionRequest",
  typeof permissionRequestSchema
>;
export type NotificationInput = WithMeta<
  "notification",
  typeof notificationSchema
>;

export type HookInput =
  | SessionStartInput
  | SessionEndInput
  | UserPromptSubmittedInput
  | PreToolUseInput
  | PreMcpToolCallInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | ErrorOccurredInput
  | AgentStopInput
  | SubagentStopInput
  | SubagentStartInput
  | PreCompactInput
  | PermissionRequestInput
  | NotificationInput;

export type HookInputFor<E extends HookEventName> = Extract<
  HookInput,
  { event: E }
>;

export type ToolResult = z.infer<typeof toolResultSchema>;
