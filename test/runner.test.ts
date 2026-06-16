import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { continueAgent, denyTool, runHooks } from "../src/index.js";
import * as fx from "./fixtures.js";

const stdinFrom = (payload: object): NodeJS.ReadStream => {
  return Readable.from([
    JSON.stringify(payload),
  ]) as unknown as NodeJS.ReadStream;
};

const captureStdout = (): {
  stream: NodeJS.WriteStream;
  written: () => string;
} => {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return {
    stream: stream as unknown as NodeJS.WriteStream,
    written: () => buf,
  };
};

describe("runHooks", () => {
  it("dispatches to the matching handler and emits its output", async () => {
    const out = captureStdout();
    await runHooks(
      {
        agentStop: (input) => {
          expect(input.event).toBe("agentStop");
          return continueAgent("not yet");
        },
      },
      { stream: stdinFrom(fx.nativeAgentStop), out: out.stream },
    );
    expect(JSON.parse(out.written())).toEqual({
      decision: "block",
      reason: "not yet",
    });
  });

  it("normalizes compat payloads before dispatch", async () => {
    const out = captureStdout();
    await runHooks(
      {
        preToolUse: (input) => {
          expect(input.dialect).toBe("vscode");
          expect(input.toolName).toBe("Bash");
          return undefined;
        },
      },
      { stream: stdinFrom(fx.compatPreToolUse), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("emits nothing when the handler returns void", async () => {
    const out = captureStdout();
    await runHooks(
      { agentStop: () => undefined },
      { stream: stdinFrom(fx.nativeAgentStop), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("emits nothing when no handler is registered", async () => {
    const out = captureStdout();
    await runHooks(
      { preToolUse: () => denyTool("x") },
      { stream: stdinFrom(fx.nativeUserPromptSubmitted), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("fail-closed: a thrown preToolUse handler emits an explicit deny", async () => {
    const out = captureStdout();
    let captured: unknown;
    await runHooks(
      {
        preToolUse: () => {
          throw new Error("handler bug");
        },
      },
      {
        stream: stdinFrom(fx.nativePreToolUse),
        out: out.stream,
        onError: (e) => {
          captured = e;
        },
      },
    );
    expect(captured).toBeInstanceOf(Error);
    expect(JSON.parse(out.written()).permissionDecision).toBe("deny");
  });

  it("fail-closed: permissionRequest handler error emits deny", async () => {
    const out = captureStdout();
    await runHooks(
      {
        permissionRequest: () => {
          throw new Error("boom");
        },
      },
      { stream: stdinFrom(fx.nativePermissionRequest), out: out.stream },
    );
    expect(JSON.parse(out.written()).behavior).toBe("deny");
  });

  it("fail-safe: a thrown non-gated handler emits nothing", async () => {
    const out = captureStdout();
    await runHooks(
      {
        agentStop: () => {
          throw new Error("boom");
        },
      },
      { stream: stdinFrom(fx.nativeAgentStop), out: out.stream },
    );
    expect(out.written()).toBe("");
  });

  it("parse failure sets a nonzero exit code when failClosed", async () => {
    const out = captureStdout();
    let code: number | undefined;
    await runHooks(
      {},
      {
        stream: stdinFrom({ sessionId: "s1", timestamp: 1, cwd: "/r" }),
        out: out.stream,
        setExitCode: (c) => {
          code = c;
        },
      },
    );
    expect(code).toBe(1);
    expect(out.written()).toBe("");
  });
});
