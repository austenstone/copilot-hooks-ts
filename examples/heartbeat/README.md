# Heartbeat coverage gate

A stateless `agentStop` hook that stops a "heartbeat" sweep from ending early.

## The problem

A heartbeat workflow asks the agent to check several inbound sources (GitHub,
Slack, Teams, Mail) each run. Agents tend to declare success after checking two
or three. We want to hold the agent at the `agentStop` boundary until it has
actually queried all of them.

## How it works

When the agent tries to stop, the CLI fires `agentStop` with a `transcriptPath`
(the session's `events.jsonl`). The hook:

1. Loads the transcript (`loadTranscript`).
2. Confirms this is a heartbeat run (`skillNames` includes `heartbeat`). If not,
   it falls through and allows the stop — **non-heartbeat sessions are never
   gated**.
3. Counts its own prior blocks via the `HB-GATE-7f3` sentinel embedded in the
   re-prompt. After `MAX_BLOCKS` (3) it gives up so a stuck agent can exit.
4. Computes coverage from **successful** tool calls (`successfulToolCalls`) — a
   read/search/list against each source. Sends and writes don't count.
5. If any source is unchecked, returns `blockStop(reason)` listing what's left.
   Otherwise it allows the stop.

It is **fully stateless**: every fact comes from the transcript on the wire, so
there's no state file to write, read, or clean up.

## Wire it

```jsonc
// hooks.json
{
  "agentStop": [
    { "command": "npx", "args": ["tsx", "examples/heartbeat/agent-stop.ts"] }
  ]
}
```

## Customize

- `SOURCES` — the sources to require and how to detect each from a tool name.
- `MAX_BLOCKS` — how many times to re-prompt before relenting.
- The heartbeat detection in step 2 — swap `skillNames` for any signal that
  identifies your gated workflow (a marker in the initial prompt, a specific
  first tool, etc.).
