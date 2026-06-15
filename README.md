# copilot-hooks-ts

[![CI](https://github.com/austenstone/copilot-hooks-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/austenstone/copilot-hooks-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/copilot-hooks-ts.svg)](https://www.npmjs.com/package/copilot-hooks-ts)

Type-safe authoring for **GitHub Copilot CLI hooks**. Parse the stdin payload,
build a decision, and read the session transcript — all fully typed, anchored to
the real CLI subprocess wire format and `@github/copilot-sdk`'s generated event
types.

Think [`cc-hooks-ts`](https://www.npmjs.com/package/cc-hooks-ts) (Claude Code),
but for Copilot — and with a typed reader for the session transcript that the
others don't have.

```bash
npm i copilot-hooks-ts
```

> ESM-only. Node 18+. `@github/copilot-sdk` is an **optional, type-only** peer
> dependency — it contributes zero runtime weight (verified: no SDK references
> in the built `dist/index.js`).

## Why

Copilot CLI fires hooks by spawning a subprocess wired in `hooks.json`. Each
event hands your script a JSON payload on **stdin**; you reply with a JSON
decision on **stdout** (or exit 0 silently to allow). The contract has sharp
edges:

- `timestamp` is epoch-ms (a number), not a `Date`.
- the working directory key is `cwd`, not `workingDirectory`.
- `toolArgs` arrives as a **JSON-encoded string**, not an object.
- real firings carry **no** event-name field — you infer the event from keys.
- output is **flat top-level fields** (`{ permissionDecision, ... }`), the same
  for every dialect. There is no nested `hookSpecificOutput` wrapper to build.
- different events read different fields: `preToolUse` wants
  `permissionDecision`, `agentStop` wants `{ decision: "block", reason }` (block
  = keep going), `permissionRequest` wants `{ behavior }`, context events want
  `additionalContext`.
- there are **two wire dialects**, picked by your `hooks.json` key casing:
  camelCase (`preToolUse`) is native; PascalCase (`PreToolUse`) is the VS Code /
  Open Plugins snake_case shape. The library auto-detects which arrived and
  normalizes both to one canonical camelCase input.

This library encodes all of that so you don't rediscover it.

## Quick start

```ts
// my-hook.ts
import { runHooks, denyTool, injectContext, parseToolArgs } from "copilot-hooks-ts";

runHooks({
  userPromptSubmitted(input) {
    return injectContext(`cwd is ${input.cwd}`);
  },
  preToolUse(input) {
    if (input.toolName !== "bash") return; // allow
    const { command } = parseToolArgs<{ command: string }>(input) ?? {};
    if (command?.includes(".env")) return denyTool("no touching .env");
  },
});
```

```jsonc
// hooks.json — `command` is a full shell string (no separate args array)
{
  "userPromptSubmitted": [{ "command": "npx tsx my-hook.ts" }],
  "preToolUse":          [{ "command": "npx tsx my-hook.ts" }]
}
```

`runHooks` reads stdin, infers the event, detects the dialect, validates with
zod, dispatches to your handler, and emits whatever you return (returning
nothing = allow / no-op). It is **fail-closed** for `preToolUse` and
`permissionRequest`: if your handler throws, an explicit deny is emitted so a
buggy hook can't silently allow a gated action. All other events are fail-safe —
errors route to `onError` and are swallowed so a hook never crashes the agent.

## The 14 events

| `hooks.json` key | VS Code alias | Fires when | Consumed output |
| --- | --- | --- | --- |
| `sessionStart` | `SessionStart` | a session begins | `injectContext` |
| `sessionEnd` | `SessionEnd` | a session ends | *(ignored)* |
| `userPromptSubmitted` | `UserPromptSubmit` | the user sends a prompt | `injectContext` / `modifyPrompt` / `blockPrompt` / `respond` |
| `preToolUse` | `PreToolUse` | before a tool runs (fail-closed) | `allowTool` / `denyTool` / `askTool` / `modifyToolArgs` / `injectContext` |
| `preMcpToolCall` | *(native only)* | before an MCP tool call | `setMcpMeta` |
| `postToolUse` | `PostToolUse` | after a tool succeeds | `blockToolResult` / `modifyToolResult` / `injectContext` / `suppressOutput` |
| `postToolUseFailure` | `PostToolUseFailure` | after a tool errors | `injectContext` |
| `errorOccurred` | `ErrorOccurred` | an error is raised | *(ignored)* |
| `agentStop` | `Stop` | the agent is about to stop | `continueAgent` |
| `subagentStop` | `SubagentStop` | a subagent is about to stop | `continueAgent` |
| `subagentStart` | *(native only)* | a subagent starts | `injectContext` |
| `preCompact` | `PreCompact` | before transcript compaction | *(ignored)* |
| `permissionRequest` | *(native only)* | a permission prompt (fail-closed) | `allowPermission` / `denyPermission` |
| `notification` | *(native only)* | a user-facing notification | `injectContext` |

Each handler receives a fully-typed, discriminated input (`input.event` narrows
the shape; `input.dialect` tells you `"native"` vs `"vscode"`).
`parseToolArgs(input)` decodes the JSON-encoded `toolArgs` for you.

## Reading the transcript

`agentStop` payloads include `transcriptPath` — the session's `events.jsonl`,
line-delimited `SessionEvent`s from the SDK. The transcript reader types it for
you:

```ts
import { loadTranscript, joinToolCalls, successfulToolCalls, skillNames } from "copilot-hooks-ts";

const events = await loadTranscript(input.transcriptPath!);
joinToolCalls(events);       // start+complete joined by toolCallId, in order
successfulToolCalls(events); // only the ones that succeeded
skillNames(events);          // skills invoked this session
```

This is what powers the flagship [heartbeat example](./examples/heartbeat): a
stateless `agentStop` gate that keeps the agent going until it has swept every
required source — deriving everything from the transcript, no state file.

## API

- **Input**: `runHooks`, `readHookInput`, `parseHookInput`, `parseToolArgs`, `HookParseError`
- **Output (flat, dialect-agnostic)**: `injectContext`, `allowTool`, `denyTool`,
  `askTool`, `modifyToolArgs`, `setMcpMeta`, `blockPrompt`, `modifyPrompt`,
  `respond`, `blockToolResult`, `modifyToolResult`, `continueAgent`,
  `allowPermission`, `denyPermission`, `suppressOutput`, `emit`
- **Transcript**: `streamTranscript`, `loadTranscript`, `joinToolCalls`, `successfulToolCalls`, `skillNames`
- **Events / dialect**: `HOOK_EVENTS`, `inferEventName`, `detectDialect`,
  `PASCAL_TO_EVENT`, `EVENT_TO_PASCAL`, plus the `DECISION_EVENTS` /
  `CONTEXT_ONLY_EVENTS` / `OBSERVE_ONLY_EVENTS` / `FAIL_CLOSED_EVENTS` category sets
- **Schemas**: `nativeSchemaByEvent`, `compatSchemaByEvent`
- **Types**: `HookInput`, `HookInputFor<E>`, `HookOutput`, `HookHandlers`, `HookMeta`, `HookDialect`, `ToolCall`, `SessionEvent`

## Examples

See [`examples/`](./examples): context injection, a deny guardrail, and the full
heartbeat coverage gate. They typecheck against the library.

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsup -> dist (ESM + .d.ts)
npm test            # vitest
```

## License

MIT
