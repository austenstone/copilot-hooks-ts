// copilot-hooks-ts — type-safe GitHub Copilot CLI hooks.
//
// Parse the stdin payload, build a decision, read the transcript — all typed
// against the real CLI wire format and @github/copilot-sdk's session events.

// Events + inference
export { HOOK_EVENTS, toPascalEvent, inferEventName } from "./events.js";
export type { HookEventName } from "./events.js";

// Input parsing
export {
  parseHookInput,
  readHookInput,
  parseToolArgs,
  HookParseError,
} from "./input.js";

// Schemas + typed inputs
export {
  sessionStartSchema,
  userPromptSubmittedSchema,
  preToolUseSchema,
  postToolUseSchema,
  postToolUseFailureSchema,
  agentStopSchema,
  toolResultSchema,
  schemaByEvent,
} from "./schema.js";
export type {
  HookInput,
  HookInputFor,
  SessionStartInput,
  UserPromptSubmittedInput,
  PreToolUseInput,
  PostToolUseInput,
  PostToolUseFailureInput,
  AgentStopInput,
  ToolResult,
} from "./schema.js";

// Output builders
export {
  injectContext,
  allowTool,
  denyTool,
  askTool,
  blockStop,
  emit,
} from "./output.js";
export type { HookOutput } from "./output.js";

// Runner
export { runHooks } from "./runner.js";
export type { HookHandler, HookHandlers, RunHooksOptions } from "./runner.js";

// Transcript reading (events.jsonl)
export {
  streamTranscript,
  loadTranscript,
  joinToolCalls,
  successfulToolCalls,
  skillNames,
} from "./transcript.js";
export type { ToolCall } from "./transcript.js";

// Re-export the SDK's generated session-event union (type-only — zero runtime
// weight) so transcript consumers share the exact runtime event types.
export type { SessionEvent } from "@github/copilot-sdk";
