import { describe, expect, it } from "vitest";
import {
  HookParseError,
  inferEventName,
  parseHookInput,
  parseToolArgs,
} from "../src/index.js";
import * as fx from "./fixtures.js";

describe("inferEventName (native)", () => {
  it("derives event from keys when no event field is present", () => {
    expect(inferEventName(fx.nativeSessionStart)).toBe("sessionStart");
    expect(inferEventName(fx.nativeUserPromptSubmitted)).toBe(
      "userPromptSubmitted",
    );
    expect(inferEventName(fx.nativePreToolUse)).toBe("preToolUse");
    expect(inferEventName(fx.nativePostToolUse)).toBe("postToolUse");
    expect(
      inferEventName({ toolName: "x", toolArgs: "{}", error: "boom" }),
    ).toBe("postToolUseFailure");
    expect(inferEventName(fx.nativeAgentStop)).toBe("agentStop");
    expect(inferEventName(fx.nativePermissionRequest)).toBe(
      "permissionRequest",
    );
    expect(inferEventName(fx.nativeNotification)).toBe("notification");
    expect(
      inferEventName({ serverName: "gh", toolName: "x", arguments: {} }),
    ).toBe("preMcpToolCall");
    expect(
      inferEventName({
        agentName: "a",
        agentDescription: "d",
        transcriptPath: "/t",
      }),
    ).toBe("subagentStart");
    expect(
      inferEventName({
        agentName: "a",
        stopReason: "end_turn",
        transcriptPath: "/t",
      }),
    ).toBe("subagentStop");
    expect(
      inferEventName({
        trigger: "auto",
        customInstructions: "",
        transcriptPath: "/t",
      }),
    ).toBe("preCompact");
    expect(
      inferEventName({ error: { message: "x" }, errorContext: "system" }),
    ).toBe("errorOccurred");
  });
});

describe("inferEventName (compat)", () => {
  it("honors hook_event_name aliases", () => {
    expect(inferEventName(fx.compatPreToolUse)).toBe("preToolUse");
    expect(inferEventName(fx.compatAgentStop)).toBe("agentStop");
    expect(inferEventName(fx.compatUserPromptSubmit)).toBe(
      "userPromptSubmitted",
    );
    expect(inferEventName(fx.compatPostToolUse)).toBe("postToolUse");
  });
});

describe("parseHookInput (native)", () => {
  it("parses + tags a preToolUse payload, toolArgs stays a string", () => {
    const input = parseHookInput(fx.nativePreToolUse);
    expect(input.event).toBe("preToolUse");
    expect(input.dialect).toBe("native");
    if (input.event === "preToolUse") {
      expect(input.toolName).toBe("bash");
      expect(input.toolArgs).toBe('{"command":"rm -rf /"}');
      expect(parseToolArgs<{ command: string }>(input)?.command).toBe(
        "rm -rf /",
      );
    }
  });

  it("parses an agentStop payload with transcriptPath", () => {
    const input = parseHookInput(fx.nativeAgentStop);
    expect(input.event).toBe("agentStop");
    if (input.event === "agentStop") {
      expect(input.transcriptPath).toBe("/tmp/events.jsonl");
    }
  });

  it("notification keeps native dialect despite hook_event_name", () => {
    const input = parseHookInput(fx.nativeNotification);
    expect(input.event).toBe("notification");
    expect(input.dialect).toBe("native");
    if (input.event === "notification")
      expect(input.message).toBe("permission needed");
  });

  it("accepts a raw JSON string", () => {
    const input = parseHookInput(JSON.stringify(fx.nativeUserPromptSubmitted));
    expect(input.event).toBe("userPromptSubmitted");
  });
});

describe("parseHookInput (compat normalization)", () => {
  it("normalizes a VS Code preToolUse into the canonical shape", () => {
    const input = parseHookInput(fx.compatPreToolUse);
    expect(input.event).toBe("preToolUse");
    expect(input.dialect).toBe("vscode");
    if (input.event === "preToolUse") {
      expect(input.sessionId).toBe("s1");
      expect(typeof input.timestamp).toBe("number");
      expect(input.timestamp).toBe(Date.parse("2025-02-14T15:00:00.000Z"));
      expect(input.toolName).toBe("Bash");
      // tool_input object becomes the canonical JSON-string toolArgs
      expect(parseToolArgs<{ command: string }>(input)?.command).toBe(
        "rm -rf /",
      );
    }
  });

  it("normalizes a VS Code postToolUse tool_result", () => {
    const input = parseHookInput(fx.compatPostToolUse);
    expect(input.event).toBe("postToolUse");
    if (input.event === "postToolUse") {
      expect(input.toolResult.resultType).toBe("success");
      expect(input.toolResult.textResultForLlm).toBe("a\nb");
    }
  });

  it("normalizes a VS Code postToolUse tool_response string", () => {
    const input = parseHookInput(fx.compatPostToolUseResponse);
    expect(input.event).toBe("postToolUse");
    expect(input.dialect).toBe("vscode");
    if (input.event === "postToolUse") {
      expect(input.toolName).toBe("run_in_terminal");
      expect(input.toolResult.textResultForLlm).toBe("build complete");
      expect(input.toolResult.resultType).toBeUndefined();
    }
  });
});

describe("parseHookInput errors", () => {
  it("throws HookParseError on invalid JSON", () => {
    expect(() => parseHookInput("not json")).toThrow(HookParseError);
  });

  it("throws HookParseError when no event can be inferred", () => {
    expect(() =>
      parseHookInput({ sessionId: "s1", timestamp: 1, cwd: "/r" }),
    ).toThrow(HookParseError);
  });

  it("throws HookParseError on schema mismatch", () => {
    expect(() =>
      parseHookInput({ sessionId: "s1", timestamp: 1, prompt: 42 }),
    ).toThrow(HookParseError);
  });
});

describe("parseToolArgs", () => {
  it("returns undefined for absent or bad args", () => {
    expect(parseToolArgs({})).toBeUndefined();
    expect(parseToolArgs({ toolArgs: "{not json" })).toBeUndefined();
  });
});
