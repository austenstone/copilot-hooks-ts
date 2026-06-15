// copilot-hooks-ts — type-safe GitHub Copilot CLI hooks.
//
// Parse the stdin payload, build a decision, read the transcript — all typed
// against the real CLI wire format (copilot-agent-runtime) and
// @github/copilot-sdk's session events. Native (camelCase) dialect by default,
// with VS Code / Open Plugins (snake_case) compat auto-detected and normalized.

// Re-export the SDK's generated session-event union (type-only — zero runtime
// weight) so transcript consumers share the exact runtime event types.
export type { SessionEvent } from "@github/copilot-sdk";
// Schemas + typed inputs
export { compatSchemaByEvent } from "./compat.js";
export type { HookDialect, HookEventName } from "./events.js";
// Events, categories, dialect detection
export {
  CONTEXT_ONLY_EVENTS,
  DECISION_EVENTS,
  detectDialect,
  EVENT_TO_PASCAL,
  FAIL_CLOSED_EVENTS,
  HOOK_EVENTS,
  inferEventName,
  OBSERVE_ONLY_EVENTS,
  PASCAL_TO_EVENT,
} from "./events.js";
// Input parsing
export {
  HookParseError,
  parseHookInput,
  parseToolArgs,
  readHookInput,
} from "./input.js";
export type { HookOutput } from "./output.js";
// Output builders (flat, dialect-agnostic)
export {
  allowPermission,
  allowTool,
  askTool,
  blockPrompt,
  blockToolResult,
  continueAgent,
  denyPermission,
  denyTool,
  emit,
  injectContext,
  modifyPrompt,
  modifyToolArgs,
  modifyToolResult,
  respond,
  setMcpMeta,
  suppressOutput,
} from "./output.js";
export type {
  HookHandler,
  HookHandlers,
  HookResult,
  RunHooksOptions,
} from "./runner.js";
// Runner
export { runHooks } from "./runner.js";
export type {
  AgentStopInput,
  ErrorOccurredInput,
  HookInput,
  HookInputFor,
  HookMeta,
  NotificationInput,
  PermissionRequestInput,
  PostToolUseFailureInput,
  PostToolUseInput,
  PreMcpToolCallInput,
  PreToolUseInput,
  SessionEndInput,
  SessionStartInput,
  SubagentStartInput,
  SubagentStopInput,
  ToolResult,
  UserPromptSubmittedInput,
} from "./schema.js";
export { nativeSchemaByEvent } from "./schema.js";
export type {
  CreateInput,
  GlobInput,
  GrepInput,
  InsertInput,
  ShellInput,
  StrReplaceInput,
  ToolEvent,
  ToolEventInput,
  ToolHandler,
  ToolHandlerMap,
  ToolInputOf,
  ToolName,
  ToolSchema,
  ToolScopedInput,
  ViewInput,
} from "./tools.js";
// Tool-scoped hooks + augmentable tool schema
export { onTool } from "./tools.js";
export type { ToolCall } from "./transcript.js";
// Transcript reading (events.jsonl)
export {
  joinToolCalls,
  loadTranscript,
  skillNames,
  streamTranscript,
  successfulToolCalls,
} from "./transcript.js";
