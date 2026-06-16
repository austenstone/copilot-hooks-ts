#!/usr/bin/env node
// Before & after — one hook, two events, around the SAME tool call.
//
// preToolUse fires BEFORE a command runs; postToolUse fires AFTER it returns.
// The runtime invokes each event as a separate subprocess, so to measure a
// command we stash a start time on the `before` side and read it back on the
// `after` side, keyed by sessionId + the command text (good enough for a demo;
// note the collision caveat below).
//
// The shell tool is named differently per surface: `bash` in the Copilot CLI,
// `run_in_terminal` in VS Code, `powershell` on Windows. Rather than enumerate
// them, we key on `default` (every tool) and act only when the decoded input
// carries a `command` string — that naturally selects the shell-like tools and
// skips view/grep/etc.
//
// What each side is allowed to return (per the runtime):
//   preToolUse  → allow / deny / modify args / injectContext   (fail-closed)
//   postToolUse → block / modify result / injectContext        (fail-safe)
// Here `before` just observes (returns nothing = allow), and `after` injects a
// one-line note into the model's context when a command ran long.

import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { injectContext, runHooks } from "copilot-hooks-ts";

const SLOW_MS = 3_000; // flag commands slower than this

// Pull the shell command out of a tool's decoded input, whatever its shape.
const commandOf = (toolInput: unknown): string => {
  const command = (toolInput as { command?: unknown })?.command;
  return typeof command === "string" ? command : "";
};

// A stable temp path for this (session, command) pair. Two identical commands in
// flight at once would collide — fine for a demo, swap in a per-call id if you
// need precision.
const stashPath = (sessionId: string, command: string): string => {
  const key = createHash("sha1")
    .update(`${sessionId}\0${command}`)
    .digest("hex")
    .slice(0, 16);
  return join(tmpdir(), `copilot-trace-${key}.json`);
};

runHooks(
  {
    // BEFORE: record the start time, then allow the command to run.
    preToolUse: {
      default({ sessionId, timestamp, toolInput }) {
        const command = commandOf(toolInput);
        if (!command) return;
        writeFileSync(
          stashPath(sessionId, command),
          JSON.stringify({ startedAt: timestamp }),
        );
        return; // return nothing -> allow
      },
    },

    // AFTER: read the start time back, compute elapsed, clean up. If it ran long,
    // inject a hidden note the model sees on its next turn.
    postToolUse: {
      default({ sessionId, timestamp, toolInput, toolResult }) {
        const command = commandOf(toolInput);
        if (!command) return;

        const path = stashPath(sessionId, command);
        let startedAt: number | undefined;
        try {
          startedAt = JSON.parse(readFileSync(path, "utf8")).startedAt;
        } catch {
          return; // no matching `before` -> nothing to measure
        } finally {
          rmSync(path, { force: true });
        }

        const elapsed = timestamp - (startedAt ?? timestamp);
        const failed = toolResult.resultType === "failure";
        console.error(
          `[trace] ${elapsed}ms ${failed ? "FAIL" : "ok"}  $ ${command}`,
        );

        if (elapsed >= SLOW_MS) {
          return injectContext(
            `Heads up: \`${command}\` took ${(elapsed / 1000).toFixed(1)}s. If you'll run it repeatedly, consider caching or narrowing it.`,
          );
        }
        return;
      },
    },
  },
  {
    onError: (err) => console.error("[before-after]", err),
  },
);
