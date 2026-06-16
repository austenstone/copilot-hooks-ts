# before-after

One hook file wired to **two events** so it brackets the same tool call:
`preToolUse` runs **before** a `bash` command, `postToolUse` runs **after** it
returns. Together they measure how long the command took.

## How it works

The CLI invokes each event as its own subprocess, so the two sides can't share
memory. The `before` handler stashes a start timestamp to a temp file keyed by
`sessionId` + the command text; the `after` handler reads it back, computes the
elapsed time, and deletes the file.

| Side | Event | Does |
| --- | --- | --- |
| before | `preToolUse` | Write `{ startedAt }` to a temp file, then allow (returns nothing). |
| after | `postToolUse` | Read `startedAt`, log `<elapsed>ms`, and `injectContext(...)` if it ran slow. |

`preToolUse` is **fail-closed** (a crash denies the tool), so the before side
only observes and always allows. `postToolUse` is fail-safe and can `injectContext`,
`modifyToolResult`, or `blockToolResult` — here it injects a one-line nudge when a
command crosses the slow threshold (`SLOW_MS`, 3s).

## Run it

```jsonc
// hooks.json (native, camelCase)
{
  "preToolUse":  [{ "command": "npx tsx examples/before-after/pre-post.ts" }],
  "postToolUse": [{ "command": "npx tsx examples/before-after/pre-post.ts" }]
}
```

```jsonc
// hooks.vscode.json (VS Code / Open Plugins, PascalCase)
{
  "PreToolUse":  [{ "command": "npx tsx examples/before-after/pre-post.ts" }],
  "PostToolUse": [{ "command": "npx tsx examples/before-after/pre-post.ts" }]
}
```

The `[trace] <ms> ...` line goes to **stderr** so it never pollutes the JSON
decision on stdout.

## Caveat

The temp-file key is `sessionId` + command text. Two identical commands running
at the same moment would collide. For a demo that's fine; for production, key on
a per-call id instead.
