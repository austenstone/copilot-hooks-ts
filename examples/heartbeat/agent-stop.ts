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

import {
  continueAgent,
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
      if (!input.transcriptPath) return;

      const events = await loadTranscript(input.transcriptPath);

      const isHeartbeat = skillNames(events).some((n) => /heartbeat/i.test(n));
      if (!isHeartbeat) return;

      const priorBlocks = events.filter(
        (e) =>
          e.type === "user.message" &&
          typeof e.data.content === "string" &&
          e.data.content.includes(SENTINEL),
      ).length;
      if (priorBlocks >= MAX_BLOCKS) return;

      const calls = successfulToolCalls(events);
      const unchecked = SOURCES.filter(
        (src) => !calls.some((call) => src.matches(call)),
      );
      if (unchecked.length === 0) return;

      const names = unchecked.map((s) => s.name).join(", ");
      return continueAgent(
        `${SENTINEL} HEARTBEAT COVERAGE GATE — not done yet.
        Still UNCHECKED: ${names}.
        Make a successful tool call for each unchecked source.`,
      );
    },
  },
  {
    // Hooks must never crash the agent; log and fall through to "allow".
    onError: (err) => console.error("[heartbeat-gate]", err),
  },
);
