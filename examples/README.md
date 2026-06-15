# Examples

Each example is a self-contained Copilot CLI hook built with `copilot-hooks-ts`.
They typecheck against the library in CI (`examples/tsconfig.json`).

| Example | Event | What it shows |
| --- | --- | --- |
| [`context-injection/`](./context-injection) | `userPromptSubmitted` | Inject hidden context (git branch + a house rule) the model sees every turn. |
| [`guardrail-deny/`](./guardrail-deny) | `preToolUse` | Fail-closed guardrail that denies dangerous shell commands before they run. |
| [`heartbeat/`](./heartbeat) | `agentStop` | **Flagship.** Stateless coverage gate: read the transcript, block the stop until the agent has swept every required source. |

## Running them

The CLI invokes hooks as subprocesses defined in `hooks.json`. The examples are
`.ts`, so either:

**A. Compile to JS** and point `hooks.json` at the output:

```jsonc
{ "agentStop": [{ "command": "node", "args": ["dist-examples/heartbeat/agent-stop.js"] }] }
```

**B. Run TypeScript directly** with a loader such as [`tsx`](https://tsx.is):

```jsonc
{ "agentStop": [{ "command": "npx", "args": ["tsx", "examples/heartbeat/agent-stop.ts"] }] }
```

In your own project you'd just `npm i copilot-hooks-ts`, write a `.ts` hook, and
wire it the same way. The `import "copilot-hooks-ts"` lines here resolve to the
local source via the path mapping in `examples/tsconfig.json`.
