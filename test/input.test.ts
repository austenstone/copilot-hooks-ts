import { describe, expect, it } from "vitest";
import {
  parseHookInput,
  parseToolArgs,
  HookParseError,
  inferEventName,
} from "../src/index.js";

describe("inferEventName", () => {
  it("derives event from keys (no hookEventName on real firings)", () => {
    expect(inferEventName({ source: "new", initialPrompt: "hi" })).toBe(
      "sessionStart",
    );
    expect(inferEventName({ prompt: "do thing" })).toBe("userPromptSubmitted");
    expect(inferEventName({ toolName: "x", toolArgs: "{}" })).toBe("preToolUse");
    expect(
      inferEventName({ toolName: "x", toolArgs: "{}", toolResult: {} }),
    ).toBe("postToolUse");
    expect(
      inferEventName({ toolName: "x", toolArgs: "{}", error: "boom" }),
    ).toBe("postToolUseFailure");
    expect(inferEventName({ stopReason: "done", transcriptPath: "/t" })).toBe(
      "agentStop",
    );
  });

  it("honors an explicit PascalCase hookEventName", () => {
    expect(inferEventName({ hookEventName: "PreToolUse", toolName: "x" })).toBe(
      "preToolUse",
    );
  });
});

describe("parseHookInput", () => {
  const base = { sessionId: "s1", timestamp: 1, cwd: "/repo" };

  it("parses + tags a preToolUse payload", () => {
    const input = parseHookInput({
      ...base,
      toolName: "bash",
      toolArgs: '{"command":"ls"}',
    });
    expect(input.event).toBe("preToolUse");
    if (input.event === "preToolUse") {
      expect(input.toolName).toBe("bash");
      expect(parseToolArgs<{ command: string }>(input)?.command).toBe("ls");
    }
  });

  it("parses an agentStop payload with transcriptPath", () => {
    const input = parseHookInput({
      ...base,
      stopReason: "completed",
      transcriptPath: "/tmp/events.jsonl",
    });
    expect(input.event).toBe("agentStop");
    if (input.event === "agentStop") {
      expect(input.transcriptPath).toBe("/tmp/events.jsonl");
    }
  });

  it("accepts a raw JSON string", () => {
    const input = parseHookInput(JSON.stringify({ ...base, prompt: "hello" }));
    expect(input.event).toBe("userPromptSubmitted");
  });

  it("throws HookParseError on invalid JSON", () => {
    expect(() => parseHookInput("not json")).toThrow(HookParseError);
  });

  it("throws HookParseError when no event can be inferred", () => {
    expect(() => parseHookInput({ ...base })).toThrow(HookParseError);
  });

  it("throws HookParseError on schema mismatch", () => {
    expect(() =>
      parseHookInput({ sessionId: "s1", timestamp: 1, prompt: "x" }),
    ).toThrow(HookParseError);
  });
});

describe("parseToolArgs", () => {
  it("returns undefined for absent or bad args", () => {
    expect(parseToolArgs({})).toBeUndefined();
    expect(parseToolArgs({ toolArgs: "{not json" })).toBeUndefined();
  });
});
