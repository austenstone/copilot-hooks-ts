import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  joinToolCalls,
  loadTranscript,
  skillNames,
  successfulToolCalls,
} from "../src/index.js";

const lines = [
  { type: "user.message", data: { content: "do the thing" } },
  {
    type: "tool.execution_start",
    data: { toolCallId: "c1", toolName: "bash", arguments: { command: "ls" } },
  },
  {
    type: "tool.execution_complete",
    data: { toolCallId: "c1", success: true },
  },
  {
    type: "tool.execution_start",
    data: { toolCallId: "c2", toolName: "edit", arguments: {} },
  },
  {
    type: "tool.execution_complete",
    data: { toolCallId: "c2", success: false, error: "nope" },
  },
  {
    type: "skill.invoked",
    data: { name: "heartbeat", content: "", path: "/h" },
  },
];

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "chooks-"));
  const path = join(dir, "events.jsonl");
  writeFileSync(
    path,
    `${lines.map((l) => JSON.stringify(l)).join("\n")}\n\n`, // trailing blank line
    "utf8",
  );
  return path;
}

describe("transcript reader", () => {
  it("loads and types every non-blank line", async () => {
    const events = await loadTranscript(fixture());
    expect(events).toHaveLength(lines.length);
  });

  it("joins starts to completes by toolCallId, preserving order", async () => {
    const events = await loadTranscript(fixture());
    const calls = joinToolCalls(events);
    expect(calls.map((c) => c.toolName)).toEqual(["bash", "edit"]);
    expect(calls[0]?.success).toBe(true);
    expect(calls[1]?.success).toBe(false);
    expect(calls[1]?.error).toBe("nope");
  });

  it("filters to successful tool calls", async () => {
    const events = await loadTranscript(fixture());
    const ok = successfulToolCalls(events);
    expect(ok.map((c) => c.toolName)).toEqual(["bash"]);
  });

  it("extracts skill names", async () => {
    const events = await loadTranscript(fixture());
    expect(skillNames(events)).toEqual(["heartbeat"]);
  });
});
