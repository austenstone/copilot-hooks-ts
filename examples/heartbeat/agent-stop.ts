#!/usr/bin/env node
// Heartbeat coverage gate — the flagship copilot-hooks-ts example.
//
// Problem: a "heartbeat" workflow asks the agent to sweep several inbound
// sources (GitHub, Slack, Teams, Mail) before it's allowed to stop. Left alone,
// the agent often declares victory early. This agentStop hook reads the session
// transcript, checks which sources were actually queried, and BLOCKS the stop
// (re-prompting the agent) until coverage is complete.
//
// It is fully STATELESS: every fact is derived from the transcript on the wire,
// so there's no state file to manage or clean up.
//
// Wire it in hooks.json:
//   { "agentStop": [{ "command": "node", "args": ["examples/heartbeat/agent-stop.ts"] }] }
// (compile first, or run via a loader / tsx; see README.)

import {
  blockStop,
  loadTranscript,
  runHooks,
  skillNames,
  successfulToolCalls,
  type ToolCall,
} from "copilot-hooks-ts";

// Sentinel embedded in the block reason so we can detect our OWN prior blocks
// in the transcript and count them (escape valve below).
const SENTINEL = "HB-GATE-7f3";

// Max times we'll block before giving up, so a genuinely-stuck agent can exit.
const MAX_BLOCKS = 3;

interface Source {
  name: string;
  // A source counts as "checked" if any successful tool call matches.
  matches: (call: ToolCall) => boolean;
}

const SOURCES: Source[] = [
  { name: "github", matches: (c) => /github/i.test(c.toolName) },
  { name: "slack", matches: (c) => /slack/i.test(c.toolName) },
  { name: "teams", matches: (c) => /teams/i.test(c.toolName) },
  { name: "mail", matches: (c) => /mail/i.test(c.toolName) },
];

runHooks(
  {
    async agentStop(input) {
      // No transcript -> nothing to gate on; let the agent stop.
      if (!input.transcriptPath) return;

      const events = await loadTranscript(input.transcriptPath);

      // Only gate heartbeat sessions. The heartbeat skill being invoked is the
      // signal this is a coverage run and not some unrelated task.
      const isHeartbeat = skillNames(events).some((n) => /heartbeat/i.test(n));
      if (!isHeartbeat) return;

      // Escape valve: if we've already blocked MAX_BLOCKS times, stop nagging.
      const priorBlocks = events.filter(
        (e) =>
          e.type === "user.message" &&
          typeof e.data.content === "string" &&
          e.data.content.includes(SENTINEL),
      ).length;
      if (priorBlocks >= MAX_BLOCKS) return;

      // Which sources were actually queried (successful read/search/list)?
      const calls = successfulToolCalls(events);
      const unchecked = SOURCES.filter(
        (src) => !calls.some((call) => src.matches(call)),
      );
      if (unchecked.length === 0) return; // full coverage -> allow stop

      const names = unchecked.map((s) => s.name).join(", ");
      return blockStop(
        `${SENTINEL} HEARTBEAT COVERAGE GATE — not done yet. ` +
          `Still UNCHECKED: ${names}. ` +
          `Make a successful read/search/list call for each unchecked source ` +
          `(sends/writes do NOT count), then you may stop.`,
      );
    },
  },
  {
    // Hooks must never crash the agent; log and fall through to "allow".
    onError: (err) => console.error("[heartbeat-gate]", err),
  },
);
