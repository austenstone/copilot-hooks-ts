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
- real firings carry **no** `hookEventName` — you infer the event from keys.
- the stdout `hookEventName` is **PascalCase** (`PreToolUse`) even though the
  `hooks.json` wiring key is **camelCase** (`preToolUse`).
- `agentStop` uses a different output shape (`{ decision, reason }`) than the
  permission/context events.

This library encodes all of that so you don't rediscover it.

## Quick start

```ts
// my-hook.ts
import { runHooks, denyTool, injectContext, parseToolArgs } from "copilot-hooks-ts";

runHooks({
  userPromptSubmitted(input) {
    return injectContext(`cwd is ${input.cwd}`, "userPromptSubmitted");
  },
  preToolUse(input) {
    if (input.toolName !== "bash") return; // allow
    const { command } = parseToolArgs<{ command: string }>(input) ?? {};
    if (command?.includes(".env")) return denyTool("no touching .env");
  },
});
```

```jsonc
// hooks.json
{
  "userPromptSubmitted": [{ "command": "npx", "args": ["tsx", "my-hook.ts"] }],
  "preToolUse":          [{ "command": "npx", "args": ["tsx", "my-hook.ts"] }]
}
```

`runHooks` reads stdin, infers the event, validates it with zod, dispatches to
your handler, and emits whatever you return (returning nothing = allow / no-op).
It's **fail-safe**: errors route to `onError` and are swallowed so a hook never
crashes the agent.

## The six events

| `hooks.json` key | Fires when | Return to… |
| --- | --- | --- |
| `sessionStart` | a session begins | `injectContext` |
| `userPromptSubmitted` | the user sends a prompt | `injectContext` |
| `preToolUse` | before a tool runs (fail-closed) | `allowTool` / `denyTool` / `askTool` |
| `postToolUse` | after a tool succeeds | (observe) |
| `postToolUseFailure` | after a tool errors | (observe) |
| `agentStop` | the agent is about to stop | `blockStop` |

Each handler receives a fully-typed, discriminated input (`input.event` narrows
the shape). `parseToolArgs(input)` decodes the JSON-encoded `toolArgs` for you.

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
stateless `agentStop` gate that blocks the stop until the agent has swept every
required source — deriving everything from the transcript, no state file.

## API

- **Input**: `runHooks`, `readHookInput`, `parseHookInput`, `parseToolArgs`, `HookParseError`
- **Output**: `injectContext`, `allowTool`, `denyTool`, `askTool`, `blockStop`, `emit`
- **Transcript**: `streamTranscript`, `loadTranscript`, `joinToolCalls`, `successfulToolCalls`, `skillNames`
- **Events**: `HOOK_EVENTS`, `inferEventName`, `toPascalEvent`
- **Schemas**: per-event zod schemas + `schemaByEvent`
- **Types**: `HookInput`, `HookInputFor<E>`, `HookOutput`, `HookHandlers`, `ToolCall`, `SessionEvent`

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
