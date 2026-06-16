#!/usr/bin/env node
// Guardrail — deny a tool call before it runs (fail-closed).
//
// preToolUse is fail-closed in the CLI: returning denyTool() (or throwing)
// blocks the tool. Here we block any shell command that would touch the .env
// file or run a force push. The `bash` key narrows `input.toolInput` to the
// shell input shape, so `command` is typed — no manual parsing.

import { denyTool, runHooks } from "copilot-hooks-ts";

const BLOCKED = [/\.env\b/, /git\s+push\s+.*--force/, /rm\s+-rf\s+\//];

runHooks(
  {
    preToolUse: {
      bash({ toolInput }) {
        const command = toolInput.command ?? "";
        const hit = BLOCKED.find((re) => re.test(command));
        if (hit) {
          return denyTool(
            `Blocked by guardrail: command matches ${hit}. Edit the guardrail in examples/guardrail-deny if this is intended.`,
          );
        }
        return; // no match -> fall through to normal permission flow
      },
    },
  },
  {
    onError: (err) => console.error("[guardrail]", err),
  },
);
