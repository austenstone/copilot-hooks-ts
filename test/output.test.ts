import { describe, expect, it } from "vitest";
import {
  allowPermission,
  allowTool,
  askTool,
  blockPrompt,
  blockToolResult,
  continueAgent,
  denyPermission,
  denyTool,
  injectContext,
  modifyPrompt,
  modifyToolArgs,
  modifyToolResult,
  respond,
  setMcpMeta,
  suppressOutput,
} from "../src/index.js";

describe("output builders are flat (no hookSpecificOutput wrapper)", () => {
  it("injectContext is dialect-agnostic", () => {
    expect(injectContext("ctx")).toEqual({ additionalContext: "ctx" });
  });

  it("preToolUse permission decisions are top-level", () => {
    expect(allowTool()).toEqual({ permissionDecision: "allow" });
    expect(allowTool("trusted")).toEqual({
      permissionDecision: "allow",
      permissionDecisionReason: "trusted",
    });
    expect(denyTool("no secrets")).toEqual({
      permissionDecision: "deny",
      permissionDecisionReason: "no secrets",
    });
    expect(askTool("hmm")).toEqual({
      permissionDecision: "ask",
      permissionDecisionReason: "hmm",
    });
  });

  it("modifyToolArgs / modifyToolResult", () => {
    expect(modifyToolArgs({ command: "ls -a" })).toEqual({
      modifiedArgs: { command: "ls -a" },
    });
    expect(modifyToolResult("scrubbed")).toEqual({
      modifiedResult: "scrubbed",
    });
  });

  it("setMcpMeta accepts an object or null", () => {
    expect(setMcpMeta({ trace: "x" })).toEqual({ metaToUse: { trace: "x" } });
    expect(setMcpMeta(null)).toEqual({ metaToUse: null });
  });

  it("userPromptSubmitted builders", () => {
    expect(blockPrompt("nope")).toEqual({ decision: "block", reason: "nope" });
    expect(modifyPrompt("better")).toEqual({ modifiedPrompt: "better" });
    expect(respond("answer", "router")).toEqual({
      handled: true,
      responseContent: "answer",
      handledBy: "router",
    });
    expect(respond("answer")).toEqual({
      handled: true,
      responseContent: "answer",
    });
  });

  it("postToolUse + agentStop block decisions", () => {
    expect(blockToolResult("redacted")).toEqual({
      decision: "block",
      reason: "redacted",
    });
    expect(continueAgent("keep going")).toEqual({
      decision: "block",
      reason: "keep going",
    });
  });

  it("permissionRequest behaviors", () => {
    expect(allowPermission()).toEqual({ behavior: "allow" });
    expect(denyPermission("blocked", { interrupt: true })).toEqual({
      behavior: "deny",
      message: "blocked",
      interrupt: true,
    });
  });

  it("suppressOutput", () => {
    expect(suppressOutput()).toEqual({ suppressOutput: true });
  });
});
