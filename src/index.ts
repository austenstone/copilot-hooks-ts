// copilot-hooks-ts — type-safe GitHub Copilot CLI hooks.
//
// Re-export the Copilot SDK's generated session-event union so transcript
// readers get the exact same types the runtime emits into events.jsonl.
// This is `import type` only — @github/copilot-sdk never enters the runtime
// bundle (it's a peer dependency).
export type { SessionEvent } from "@github/copilot-sdk";

export const VERSION = "0.1.0";
