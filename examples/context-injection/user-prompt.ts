#!/usr/bin/env node
// Context injection — inject hidden guidance the model sees on every prompt.
//
// Wire as either sessionStart (once per session) or userPromptSubmitted (every
// turn). Here we add the current git branch + a house rule on each prompt.

import { execSync } from "node:child_process";
import { injectContext, runHooks } from "copilot-hooks-ts";

function gitBranch(cwd: string): string | undefined {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

runHooks({
  userPromptSubmitted(input) {
    const branch = gitBranch(input.cwd);
    const lines = [
      branch ? `Current git branch: ${branch}.` : undefined,
      "House rule: never commit without an explicit request.",
    ].filter(Boolean);
    return injectContext(lines.join("\n"), "userPromptSubmitted");
  },
});
