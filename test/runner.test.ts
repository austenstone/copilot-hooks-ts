import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runHooks, blockStop } from "../src/index.js";

function stdinFrom(payload: object): NodeJS.ReadStream {
  return Readable.from([JSON.stringify(payload)]) as unknown as NodeJS.ReadStream;
}

function captureStdout(): { stream: NodeJS.WriteStream; written: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream: stream as unknown as NodeJS.WriteStream, written: () => buf };
}

const base = { sessionId: "s1", timestamp: 1, cwd: "/repo" };

describe("runHooks", () => {
  it("dispatches to the matching handler and emits its output", async () => {
    const out = captureStdout();
    await runHooks(
      {
        agentStop: (input) => {
          expect(input.event).toBe("agentStop");
          return blockStop("not yet");
        },
      },
      {
        stream: stdinFrom({ ...base, stopReason: "done", transcriptPath: "/t" }),
        out: out.stream,
      },
    );
    expect(JSON.parse(out.written())).toEqual({
      decision: "block",
      reason: "not yet",
    });
  });

  it("emits nothing when the handler returns void", async () => {
    const out = captureStdout();
    await runHooks(
      { agentStop: () => undefined },
      {
        stream: stdinFrom({ ...base, stopReason: "done", transcriptPath: "/t" }),
        out: out.stream,
      },
    );
    expect(out.written()).toBe("");
  });

  it("emits nothing when no handler is registered for the event", async () => {
    const out = captureStdout();
    await runHooks(
      { preToolUse: () => denyMarker },
      {
        stream: stdinFrom({ ...base, prompt: "hi" }),
        out: out.stream,
      },
    );
    expect(out.written()).toBe("");
  });

  it("is fail-safe: routes errors to onError and never throws", async () => {
    const out = captureStdout();
    let captured: unknown;
    await runHooks(
      {},
      {
        stream: stdinFrom({ ...base }), // unrecognizable -> parse error
        out: out.stream,
        onError: (err) => {
          captured = err;
        },
      },
    );
    expect(captured).toBeInstanceOf(Error);
    expect(out.written()).toBe("");
  });
});

const denyMarker = { hookSpecificOutput: { hookEventName: "PreToolUse" } };
