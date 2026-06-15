import { describe, expect, it } from "vitest";
import {
  injectContext,
  allowTool,
  denyTool,
  askTool,
  blockStop,
} from "../src/index.js";

describe("output builders", () => {
  it("injectContext keys by PascalCase event name", () => {
    expect(injectContext("ctx", "sessionStart")).toEqual({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: "ctx",
      },
    });
    expect(injectContext("ctx", "userPromptSubmitted")).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmitted",
        additionalContext: "ctx",
      },
    });
  });

  it("allowTool/askTool omit reason when not given", () => {
    expect(allowTool()).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    });
    expect(askTool("hmm")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "hmm",
      },
    });
  });

  it("denyTool always includes the reason", () => {
    expect(denyTool("no secrets")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "no secrets",
      },
    });
  });

  it("blockStop uses the distinct top-level shape", () => {
    expect(blockStop("keep going")).toEqual({
      decision: "block",
      reason: "keep going",
    });
  });
});
