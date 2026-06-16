# copilot-hooks-ts

[![CI](https://github.com/austenstone/copilot-hooks-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/austenstone/copilot-hooks-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/copilot-hooks-ts.svg)](https://www.npmjs.com/package/copilot-hooks-ts)

Type-safe **GitHub Copilot CLI hooks**. Write a handler, return a decision, done. The library handles the messy wire format (stdin parsing, event inference, dialect detection, zod validation) so you don't.

```bash
npm i copilot-hooks-ts
```

## Quick start

Write a hook. Here's a guardrail that blocks dangerous shell commands before they run, plus context injected once when the session starts:

```ts
// my-hook.ts
import { execSync } from "node:child_process";
import {
  runHooks,
  denyTool,
  injectContext,
  continueAgent,
  loadTranscript,
} from "copilot-hooks-ts";

const BLOCKED = [/rm\s+-rf\s+\//, /git\s+push\s+.*--force/, /\.env\b/];

runHooks({
  // Guardrail: deny a tool call before it runs. `bash` types `toolInput.command`.
  preToolUse: {
    bash({ toolInput }) {
      const hit = BLOCKED.find((re) => re.test(toolInput.command ?? ""));
      if (hit) return denyTool(`blocked by guardrail: ${hit}`);
    },
  },

  // Context injection: hand the model project context once, at session start.
  sessionStart() {
    const branch = execSync("git branch --show-current").toString().trim();
    return injectContext(`Current branch: ${branch}. House rule: no force pushes.`);
  },

  // Stop gate: if the user said "call me X", don't stop until the agent
  // actually used the name. Return continueAgent to keep going; nothing = allow.
  async agentStop(input) {
    const text = JSON.stringify(await loadTranscript(input.transcriptPath!));
    const name = text.match(/call me (\w+)/i)?.[1];
    if (name && text.split(name).length - 1 < 2) {
      return continueAgent(`The user asked to be called ${name}. Address them by name.`);
    }
  },
});
```

Wire it in `hooks.json` (`command` is a full shell string):

```jsonc
{
  "preToolUse":   [{ "command": "npx tsx my-hook.ts" }],
  "sessionStart": [{ "command": "npx tsx my-hook.ts" }],
  "agentStop":    [{ "command": "npx tsx my-hook.ts" }]
}
```

That's it. Return nothing to allow, return a builder (`denyTool`, `injectContext`, ...) to act. `preToolUse` and `permissionRequest` are **fail-closed**: if your handler throws, an explicit deny is emitted so a bug can't silently allow a gated action.

> ESM-only, Node 18+. `@github/copilot-sdk` is an optional, type-only peer dep with zero runtime weight.

## Test your hooks

`testHook` runs a handler through the real dispatch path and returns the parsed decision. Works with any test runner (Vitest, Jest, `node:test`).

```ts
import { testHook } from "copilot-hooks-ts";
import { handlers } from "./my-hook.js";

const out = await testHook(handlers, {
  event: "preToolUse",
  toolInput: { command: "rm -rf /" },
});
// out -> { permissionDecision: "deny", permissionDecisionReason: "..." }
// undefined when the hook allowed / no-op'd
```

Only `event` is required. Pass `toolInput` and it's encoded to the right wire field for you.

## Reading the transcript

`agentStop` payloads carry a `transcriptPath` to the session's `events.jsonl`. The typed reader makes it easy to gate on what actually happened:

```ts
import { loadTranscript, successfulToolCalls, skillNames } from "copilot-hooks-ts";

const events = await loadTranscript(input.transcriptPath!);
successfulToolCalls(events); // tool calls that succeeded
skillNames(events);          // skills invoked this session
```

See the [heartbeat example](./examples/heartbeat) for a stateless `agentStop` coverage gate built on this.

<details>
<summary><b>The 14 events</b></summary>

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

Each handler gets a fully-typed, discriminated input. `input.event` narrows the shape, `input.dialect` tells you `"native"` vs `"vscode"`. Both wire dialects (camelCase native, PascalCase VS Code) auto-detect and normalize to one canonical shape.

</details>

<details>
<summary><b>Tool-scoped hooks</b></summary>

The five tool events (`preToolUse`, `postToolUse`, `postToolUseFailure`, `preMcpToolCall`, `permissionRequest`) accept a map keyed by tool name. The matched key narrows `input.toolInput` to that tool's shape, and `default` catches the rest:

```ts
runHooks({
  preToolUse: {
    bash({ toolInput }) {
      if (toolInput.command.includes("rm -rf /")) return denyTool("nope");
    },
    view({ toolInput }) {
      // toolInput: { path: string; view_range?: number[] }
    },
    default({ toolName }) {},
  },
});
```

Built-in shapes ship for `bash` / `powershell` / `local_shell`, `view`, `create`, `edit`, `str_replace_editor`, `glob`, and `grep`. Use `onTool<"preToolUse">({ ... })` for a standalone handler.

Type your own (or MCP) tools via declaration merging:

```ts
declare module "copilot-hooks-ts" {
  interface ToolSchema {
    "mcp__deepwiki__ask_question": {
      input: { question: string; repoName: string };
    };
  }
}
```

</details>

<details>
<summary><b>API reference</b></summary>

- **Run / input**: `runHooks`, `readHookInput`, `parseHookInput`, `parseToolArgs`, `HookParseError`
- **Output builders**: `injectContext`, `allowTool`, `denyTool`, `askTool`, `modifyToolArgs`, `setMcpMeta`, `blockPrompt`, `modifyPrompt`, `respond`, `blockToolResult`, `modifyToolResult`, `continueAgent`, `allowPermission`, `denyPermission`, `suppressOutput`, `emit`
- **Tool-scoped**: `onTool`, the augmentable `ToolSchema`, and types `ToolName`, `ToolInputOf<Name>`, `ToolScopedInput<E, Name>`, `ToolHandlerMap<E>`, `ToolEvent`, plus input shapes (`ShellInput`, `ViewInput`, `CreateInput`, `StrReplaceInput`, `InsertInput`, `GlobInput`, `GrepInput`)
- **Transcript**: `streamTranscript`, `loadTranscript`, `joinToolCalls`, `successfulToolCalls`, `skillNames`
- **Testing**: `testHook`, `buildHookPayload` (types `HookPayloadSpec`, `TestHookOptions`)
- **Events / dialect**: `HOOK_EVENTS`, `inferEventName`, `detectDialect`, `PASCAL_TO_EVENT`, `EVENT_TO_PASCAL`, and the `DECISION_EVENTS` / `CONTEXT_ONLY_EVENTS` / `OBSERVE_ONLY_EVENTS` / `FAIL_CLOSED_EVENTS` category sets
- **Schemas**: `nativeSchemaByEvent`, `compatSchemaByEvent`
- **Types**: `HookInput`, `HookInputFor<E>`, `HookOutput`, `HookHandlers`, `HookMeta`, `HookDialect`, `ToolCall`, `SessionEvent`
- **Gating**: pass `shouldRun` to `runHooks` to skip a run before stdin is read, e.g. `{ shouldRun: () => process.platform === "darwin" }`

</details>

## Examples

[`examples/`](./examples) has runnable hooks: context injection, a deny guardrail, before/after timing, and the heartbeat coverage gate. All typecheck against the library.

## License

MIT
