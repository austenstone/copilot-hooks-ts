# Examples

Each example is a self-contained Copilot CLI hook built with `copilot-hooks-ts`.
They typecheck against the library in CI (`examples/tsconfig.json`).

| Example | Event | What it shows |
| --- | --- | --- |
| [`context-injection/`](./context-injection) | `userPromptSubmitted` | Inject hidden context (git branch + a house rule) the model sees every turn. |
| [`guardrail-deny/`](./guardrail-deny) | `preToolUse` | Fail-closed guardrail that denies dangerous shell commands before they run. |
| [`before-after/`](./before-after) | `preToolUse` + `postToolUse` | One hook on both events: time each shell command before/after, and nudge the model when one runs slow. |
| [`heartbeat/`](./heartbeat) | `agentStop` | **Flagship.** Stateless coverage gate: read the transcript, block the stop until the agent has swept every required source. |

## Running them

The CLI invokes hooks as subprocesses listed in a `hooks.json`. Each example
ships two: `hooks.json` (native, camelCase keys) and `hooks.vscode.json` (VS
Code / Open Plugins, PascalCase keys). The hook scripts are identical — the only
difference is the key casing, which selects the wire dialect. The library
auto-detects and normalizes both, so handlers always see one canonical shape.

`command` is a **full shell string** run as `bash -c "<command>"`. There is no
separate `args` array for shell commands (an `args` array only applies to the
`exec` form, which runs a native executable with no shell). So to run a `.ts`
hook via [`tsx`](https://tsx.is):

```jsonc
// hooks.json (native)
{ "agentStop": [{ "command": "npx tsx examples/heartbeat/agent-stop.ts" }] }
```

```jsonc
// hooks.vscode.json (VS Code / Open Plugins — note "Stop", PascalCase)
{ "Stop": [{ "command": "npx tsx examples/heartbeat/agent-stop.ts" }] }
```

If you'd rather not pay the `tsx` startup cost per call, compile to JS first and
point `command` at the output: `{ "command": "node dist/agent-stop.js" }`.

In your own project you'd just `npm i copilot-hooks-ts`, write a `.ts` hook, and
wire it the same way. The `import "copilot-hooks-ts"` lines here resolve to the
local source via the path mapping in `examples/tsconfig.json`.
