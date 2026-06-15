// copilot-hooks-ts — type-safe GitHub Copilot CLI hooks.
//
// Parse the stdin payload, build a decision, read the transcript — all typed
// against the real CLI wire format and @github/copilot-sdk's session events.

// Re-export the SDK's generated session-event union (type-only — zero runtime
// weight) so transcript consumers share the exact runtime event types.
export type { SessionEvent } from "@github/copilot-sdk";
export type { HookEventName } from "./events.js";
// Events + inference
export { HOOK_EVENTS, inferEventName, toPascalEvent } from "./events.js";
// Input parsing
export {
  HookParseError,
  parseHookInput,
  parseToolArgs,
  readHookInput,
} from "./input.js";
export type { HookOutput } from "./output.js";

// Output builders
export {
  allowTool,
  askTool,
  blockStop,
  denyTool,
  emit,
  injectContext,
} from "./output.js";
export type { HookHandler, HookHandlers, RunHooksOptions } from "./runner.js";

// Runner
export { runHooks } from "./runner.js";
export type {
  AgentStopInput,
  HookInput,
  HookInputFor,
  PostToolUseFailureInput,
  PostToolUseInput,
  PreToolUseInput,
  SessionStartInput,
  ToolResult,
  UserPromptSubmittedInput,
} from "./schema.js";
// Schemas + typed inputs
export {
  agentStopSchema,
  postToolUseFailureSchema,
  postToolUseSchema,
  preToolUseSchema,
  schemaByEvent,
  sessionStartSchema,
  toolResultSchema,
  userPromptSubmittedSchema,
} from "./schema.js";
export type { ToolCall } from "./transcript.js";
// Transcript reading (events.jsonl)
export {
  joinToolCalls,
  loadTranscript,
  skillNames,
  streamTranscript,
  successfulToolCalls,
} from "./transcript.js";
